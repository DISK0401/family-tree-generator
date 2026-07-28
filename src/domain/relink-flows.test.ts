import { describe, expect, it } from 'vitest'
import {
  addChild,
  addPerson,
  isUnconnectedPerson,
  linkChild,
  linkSpouse,
  unlinkChild,
} from './commands'
import { createTreeDocument } from './helpers'
import {
  computeOffChartPersonIds,
  toFamilyChartData,
} from '../rendering/to-family-chart-data'
import type { TreeDocument } from './types'

/**
 * この変更が可能にする2つの使い方を、ドメインコマンドと描画データの射影を通して
 * 端から端まで確認する(spec tree-editor / tree-rendering)。
 */

function offChart(doc: TreeDocument, viewpointId: string): string[] {
  return computeOffChartPersonIds(doc, viewpointId)
}

describe('通し: 役割の取り違えの修正', () => {
  it('子として登録した人物を、入力済みデータを保ったまま配偶者へ繋ぎ変えられる', () => {
    let doc = createTreeDocument()
    const a = addPerson(doc, { name: { given: 'A' } })
    doc = a.doc

    // 誤って「子を追加」で配偶者を登録し、生年月日とメモまで入力してしまった状態
    const c = addChild(doc, a.personId, {
      name: { surname: '山田', given: '花子' },
      birth: {
        type: 'birth',
        date: {
          original: '昭和39年10月10日',
          qualifier: 'exact',
          date: { year: 1964, month: 10, day: 10 },
        },
      },
      note: '祖母から聞いた話',
    })
    doc = c.doc
    const original = doc.persons[c.childId]
    // 図の上ではAの子として描かれている
    expect(
      toFamilyChartData(doc).find((d) => d.id === c.childId)?.rels.parents,
    ).toEqual([a.personId])

    // 1) 親子関係を解除する。ひとり親の家族だったため家族ごと消え、Cは図から外れる
    doc = unlinkChild(doc, c.familyId, c.childId)
    expect(doc.families[c.familyId]).toBeUndefined()
    expect(isUnconnectedPerson(doc, c.childId)).toBe(true)
    expect(offChart(doc, a.personId)).toEqual([c.childId])

    // 2) 配偶者として繋ぎ直す
    const linked = linkSpouse(doc, a.personId, c.childId)
    doc = linked.doc

    // 図の上でAとCが婚姻線で結ばれ、親子線は残っていない
    const datumC = toFamilyChartData(doc).find((d) => d.id === c.childId)
    expect(datumC?.rels.spouses).toEqual([a.personId])
    expect(datumC?.rels.parents).toBeUndefined()
    // 一覧からも消える
    expect(offChart(doc, a.personId)).toEqual([])
    // 入力済みのデータは一切失われていない
    expect(doc.persons[c.childId]).toEqual(original)
  })
})

describe('通し: 先に登録して後から繋ぐ', () => {
  it('関係なしで登録した2人を結び、本体へ子として繋げるまで一覧が追従する', () => {
    let doc = createTreeDocument()
    const a = addPerson(doc, { name: { given: 'A' } })
    doc = a.doc
    expect(offChart(doc, a.personId)).toEqual([])

    // 1) 系統を決めずに2人を書き写す
    const x = addPerson(doc, { name: { surname: '富岡', given: '兎一' } })
    doc = x.doc
    const y = addPerson(doc, { name: { surname: '富岡', given: '榮' } })
    doc = y.doc
    expect(offChart(doc, a.personId).sort()).toEqual(
      [x.personId, y.personId].sort(),
    )

    // 2) 2人を配偶者として結ぶ。本体とは切り離されたクラスタのため、まだ一覧に残る
    doc = linkSpouse(doc, x.personId, y.personId).doc
    expect(offChart(doc, a.personId).sort()).toEqual(
      [x.personId, y.personId].sort(),
    )

    // 3) 本体の人物Aの子としてXを繋ぐと、Yもクラスタごと図に現れて一覧が空になる
    doc = linkChild(doc, a.personId, x.personId).doc
    expect(offChart(doc, a.personId)).toEqual([])

    const data = toFamilyChartData(doc)
    expect(data.find((d) => d.id === x.personId)?.rels.parents).toEqual([
      a.personId,
    ])
    expect(data.find((d) => d.id === x.personId)?.rels.spouses).toEqual([
      y.personId,
    ])
    // 旧字体を含む氏名は正規化されない
    expect(doc.persons[y.personId].name.given).toBe('榮')
  })
})

import { describe, expect, it } from 'vitest'
import { SCHEMA_VERSION } from '../domain/types'
import { treeDocumentSchema } from '../lib/json/schema'
import { loadSampleDocument } from './load-sample'
import { SAMPLE_IDS } from './sample-meta'

/*
 * サンプル4種の整合性テスト。
 * サンプルは手書きのTreeDocumentリテラルのため、フィールド形状(zodスキーマ)と
 * 参照整合性(spouseIds/childIdがpersonsに存在するか)の両方を機械検証する。
 */
describe('サンプルデータの整合性', () => {
  it.each(SAMPLE_IDS)('%s がzodスキーマと参照整合性を満たす', async (id) => {
    const doc = await loadSampleDocument(id)
    expect(doc).toBeDefined()
    if (!doc) return

    // フィールド形状の検証(不正ならZodErrorでテストが落ちる)
    treeDocumentSchema.parse(doc)

    expect(doc.schemaVersion).toBe(SCHEMA_VERSION)
    expect(doc.title.length).toBeGreaterThan(0)

    // Recordのキーとエンティティidの一致
    for (const [key, person] of Object.entries(doc.persons)) {
      expect(person.id).toBe(key)
    }
    for (const [key, family] of Object.entries(doc.families)) {
      expect(family.id).toBe(key)
    }

    // 参照整合性: 家族が指す人物がすべて存在する
    for (const family of Object.values(doc.families)) {
      for (const spouseId of family.spouseIds) {
        expect(
          doc.persons[spouseId],
          `${family.id} の配偶者 ${spouseId}`,
        ).toBeDefined()
      }
      for (const child of family.children) {
        expect(
          doc.persons[child.childId],
          `${family.id} の子 ${child.childId}`,
        ).toBeDefined()
      }
    }
  })

  it('originalに月日を含む構造化日付は、月日が原文と一致している(明治6年以降の写し漏れ検知)', async () => {
    for (const id of SAMPLE_IDS) {
      const doc = await loadSampleDocument(id)
      if (!doc) continue
      const fuzzyDates = [
        ...Object.values(doc.persons).flatMap((p) => [
          p.birth?.date,
          p.death?.date,
        ]),
        ...Object.values(doc.families).flatMap((f) =>
          f.events.map((e) => e.date),
        ),
      ]
      for (const fuzzy of fuzzyDates) {
        if (!fuzzy?.date?.month || !fuzzy.date.day) continue
        // 月日まで構造化されている場合、originalの「N月N日」表記と矛盾しないこと
        // (明治6年以降のグレゴリオ暦採用後は和暦の月日=西暦の月日)。
        // 「11月」を「1月」と誤マッチしないよう、月の直前に数字が無いことを確認する
        const monthDay = new RegExp(
          `(?<![0-9])${fuzzy.date.month}月${fuzzy.date.day}日`,
        )
        expect(fuzzy.original, `${id}: ${fuzzy.original}`).toMatch(monthDay)
      }
    }
  })
})

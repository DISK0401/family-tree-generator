import { describe, expect, it } from 'vitest'
import { SCHEMA_VERSION } from '../domain/types'
import { treeDocumentSchema } from '../lib/json/schema'
import { formatDateForDisplay } from '../store/display-settings'
import { loadSampleDocument } from './load-sample'
import { SAMPLE_IDS, type SampleId } from './sample-meta'
import type { FuzzyDate } from '../domain/types'

/*
 * 全サンプル共通の整合性テスト(SAMPLE_IDS の全件)。
 * サンプルは手書きのTreeDocumentリテラルのため、フィールド形状(zodスキーマ)・
 * 参照整合性(spouseIds/childIdがpersonsに存在するか)・和暦日付の表記を機械検証する。
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

  /*
   * 和暦表示が原文どおりに戻らない既知の例外(spec「旧暦を含む日付の収録方針」)。
   * 例外はここに理由付きで列挙し、これ以外は原文と一致することを保証する。
   */
  const WAREKI_DISPLAY_EXCEPTIONS: Record<string, string> = {
    // 立年改元: 正保への改元は正保元年12月16日。それ以前の日付は改元前の元号に戻る
    正保元年5月24日: '寛永21年5月24日',
    // 閏月は入力・表示ともに未対応のため、構造化日付は同じ番号の月へ畳んでいる
    享保6年閏7月16日: '享保6年7月16日',
    天保12年閏1月7日: '天保12年1月7日',
    弘化3年閏5月24日: '弘化3年5月24日',
    文化13年閏8月19日: '文化13年8月19日',
    慶長12年閏4月8日: '慶長12年4月8日',
  }

  /** 元号名で始まり、修飾語を含まない原文のみを対象にする */
  function isPlainWareki(original: string): boolean {
    return (
      /^[^\d]+(元|\d{1,2})年/.test(original) &&
      !/頃|以前|以後|ごろ/.test(original)
    )
  }

  async function warekiDatesOf(id: SampleId): Promise<FuzzyDate[]> {
    const doc = await loadSampleDocument(id)
    if (!doc) return []
    return [
      ...Object.values(doc.persons).flatMap((p) => [
        p.birth?.date,
        p.death?.date,
      ]),
      ...Object.values(doc.families).flatMap((f) =>
        f.events.map((e) => e.date),
      ),
    ].filter(
      (d): d is FuzzyDate => d !== undefined && isPlainWareki(d.original),
    )
  }

  it('和暦表示が原文どおりに戻る(旧暦の名目値の取り違えを検知)', async () => {
    let checked = 0
    for (const id of SAMPLE_IDS) {
      for (const fuzzy of await warekiDatesOf(id)) {
        const expected =
          WAREKI_DISPLAY_EXCEPTIONS[fuzzy.original] ?? fuzzy.original
        expect(
          formatDateForDisplay(fuzzy.date, 'full', 'wareki'),
          `${id}: ${fuzzy.original}`,
        ).toBe(expected)
        checked += 1
      }
    }
    // 対象が意図せず0件に減っていないことの保険
    expect(checked).toBeGreaterThan(90)
  })

  it('例外リストの原文が実際にサンプルに存在する(古い例外の置き忘れ検知)', async () => {
    const originals = new Set<string>()
    for (const id of SAMPLE_IDS) {
      for (const fuzzy of await warekiDatesOf(id)) originals.add(fuzzy.original)
    }
    for (const original of Object.keys(WAREKI_DISPLAY_EXCEPTIONS)) {
      expect(originals, `例外 ${original}`).toContain(original)
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
        // (旧暦は名目方式で写し、改暦後は和暦の月日=西暦の月日なので、どちらも一致する)。
        // 「11月」を「1月」と誤マッチしないよう、月の直前に数字が無いことを確認する
        const monthDay = new RegExp(
          `(?<![0-9])${fuzzy.date.month}月${fuzzy.date.day}日`,
        )
        expect(fuzzy.original, `${id}: ${fuzzy.original}`).toMatch(monthDay)
      }
    }
  })
})

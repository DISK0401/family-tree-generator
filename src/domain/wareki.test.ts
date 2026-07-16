import { describe, expect, it } from 'vitest'
import {
  formatGregorian,
  formatWareki,
  gregorianToWareki,
  warekiToGregorian,
} from './wareki'

describe('warekiToGregorian', () => {
  it('昭和39年10月10日 → 1964年10月10日', () => {
    const r = warekiToGregorian({ era: '昭和', year: 39, month: 10, day: 10 })
    expect(r).toEqual({ ok: true, value: { year: 1964, month: 10, day: 10 } })
  })

  it('年のみ・年月のみの部分日付を変換できる', () => {
    expect(warekiToGregorian({ era: '平成', year: 5 })).toEqual({
      ok: true,
      value: { year: 1993 },
    })
    expect(warekiToGregorian({ era: '令和', year: 2, month: 4 })).toEqual({
      ok: true,
      value: { year: 2020, month: 4 },
    })
  })

  it('改元境界日: 平成31年4月30日と令和元年5月1日', () => {
    expect(warekiToGregorian({ era: '平成', year: 31, month: 4, day: 30 })).toEqual({
      ok: true,
      value: { year: 2019, month: 4, day: 30 },
    })
    expect(warekiToGregorian({ era: '令和', year: 1, month: 5, day: 1 })).toEqual({
      ok: true,
      value: { year: 2019, month: 5, day: 1 },
    })
  })

  it('改元境界日: 昭和64年1月7日は有効、平成31年5月1日は無効', () => {
    expect(warekiToGregorian({ era: '昭和', year: 64, month: 1, day: 7 })).toEqual({
      ok: true,
      value: { year: 1989, month: 1, day: 7 },
    })
    const over = warekiToGregorian({ era: '平成', year: 31, month: 5, day: 1 })
    expect(over.ok).toBe(false)
  })

  it('昭和65年は「昭和は64年まで」というエラーになる', () => {
    const r = warekiToGregorian({ era: '昭和', year: 65, month: 1, day: 1 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('昭和は64年まで')
  })

  it('元号の開始日より前の日付は無効(明治45年7月30日=大正開始日)', () => {
    expect(warekiToGregorian({ era: '明治', year: 45, month: 7, day: 29 }).ok).toBe(true)
    // 明治45年7月30日はテーブル上は大正元年。年月日が明治の終端を超えるためエラー
    const r = warekiToGregorian({ era: '明治', year: 45, month: 7, day: 30 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('明治')
  })

  it('存在しない暦日(平成2年2月30日)は無効', () => {
    expect(warekiToGregorian({ era: '平成', year: 2, month: 2, day: 30 }).ok).toBe(false)
  })

  it('未対応の元号はエラーになる', () => {
    const r = warekiToGregorian({ era: '慶応', year: 3 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('慶応')
  })
})

describe('gregorianToWareki', () => {
  it('1964年10月10日 → 昭和39年10月10日', () => {
    expect(gregorianToWareki({ year: 1964, month: 10, day: 10 })).toEqual({
      era: '昭和',
      year: 39,
      month: 10,
      day: 10,
    })
  })

  it('改元境界日の往復変換', () => {
    expect(gregorianToWareki({ year: 2019, month: 4, day: 30 })).toEqual({
      era: '平成',
      year: 31,
      month: 4,
      day: 30,
    })
    expect(gregorianToWareki({ year: 2019, month: 5, day: 1 })).toEqual({
      era: '令和',
      year: 1,
      month: 5,
      day: 1,
    })
  })

  it('年のみの改元年は年末時点の元号で表す(1989→平成元年)', () => {
    expect(gregorianToWareki({ year: 1989 })).toEqual({ era: '平成', year: 1 })
  })

  it('明治より前はnull(西暦のみで扱う)', () => {
    expect(gregorianToWareki({ year: 1850 })).toBeNull()
  })
})

describe('format', () => {
  it('元年表記とフル表記', () => {
    expect(formatWareki({ era: '令和', year: 1, month: 5, day: 1 })).toBe('令和元年5月1日')
    expect(formatWareki({ era: '昭和', year: 39, month: 10, day: 10 })).toBe('昭和39年10月10日')
    expect(formatWareki({ era: '平成', year: 5 })).toBe('平成5年')
    expect(formatGregorian({ year: 1964, month: 10 })).toBe('1964年10月')
  })
})

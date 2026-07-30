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
    expect(
      warekiToGregorian({ era: '平成', year: 31, month: 4, day: 30 }),
    ).toEqual({
      ok: true,
      value: { year: 2019, month: 4, day: 30 },
    })
    expect(
      warekiToGregorian({ era: '令和', year: 1, month: 5, day: 1 }),
    ).toEqual({
      ok: true,
      value: { year: 2019, month: 5, day: 1 },
    })
  })

  it('改元境界日: 昭和64年1月7日は有効、平成31年5月1日は無効', () => {
    expect(
      warekiToGregorian({ era: '昭和', year: 64, month: 1, day: 7 }),
    ).toEqual({
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
    expect(
      warekiToGregorian({ era: '明治', year: 45, month: 7, day: 29 }).ok,
    ).toBe(true)
    // 明治45年7月30日はテーブル上は大正元年。年月日が明治の終端を超えるためエラー
    const r = warekiToGregorian({ era: '明治', year: 45, month: 7, day: 30 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('明治')
  })

  it('存在しない暦日(平成2年2月30日)は無効', () => {
    expect(
      warekiToGregorian({ era: '平成', year: 2, month: 2, day: 30 }).ok,
    ).toBe(false)
  })

  it('未対応の元号はエラーになる', () => {
    const r = warekiToGregorian({ era: '慶応', year: 3 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('慶応')
  })

  it('年の0・負数・非整数は拒否する', () => {
    expect(warekiToGregorian({ era: '昭和', year: 0 }).ok).toBe(false)
    expect(warekiToGregorian({ era: '昭和', year: -1 }).ok).toBe(false)
    expect(warekiToGregorian({ era: '昭和', year: 39.5 }).ok).toBe(false)
  })

  it('明治の開始境界日(1868年10月23日)は有効、その前日は無効', () => {
    expect(
      warekiToGregorian({ era: '明治', year: 1, month: 10, day: 23 }),
    ).toEqual({
      ok: true,
      value: { year: 1868, month: 10, day: 23 },
    })
    expect(
      warekiToGregorian({ era: '明治', year: 1, month: 10, day: 22 }).ok,
    ).toBe(false)
  })

  it('大正⇄昭和の境界日', () => {
    expect(
      warekiToGregorian({ era: '大正', year: 15, month: 12, day: 24 }),
    ).toEqual({
      ok: true,
      value: { year: 1926, month: 12, day: 24 },
    })
    expect(
      warekiToGregorian({ era: '大正', year: 15, month: 12, day: 25 }).ok,
    ).toBe(false)
    expect(
      warekiToGregorian({ era: '昭和', year: 1, month: 12, day: 25 }),
    ).toEqual({
      ok: true,
      value: { year: 1926, month: 12, day: 25 },
    })
    expect(
      warekiToGregorian({ era: '昭和', year: 1, month: 12, day: 24 }).ok,
    ).toBe(false)
  })
})

describe('warekiToGregorian: 年月のみの改元境界', () => {
  it('元号の終了より後の月は拒否する(昭和64年3月・平成31年12月)', () => {
    const showa = warekiToGregorian({ era: '昭和', year: 64, month: 3 })
    expect(showa.ok).toBe(false)
    if (!showa.ok) expect(showa.message).toContain('昭和は昭和64年1月7日まで')
    expect(warekiToGregorian({ era: '平成', year: 31, month: 12 }).ok).toBe(
      false,
    )
  })

  it('境界月そのものは許容する(昭和64年1月・平成31年4月)', () => {
    expect(warekiToGregorian({ era: '昭和', year: 64, month: 1 })).toEqual({
      ok: true,
      value: { year: 1989, month: 1 },
    })
    expect(warekiToGregorian({ era: '平成', year: 31, month: 4 })).toEqual({
      ok: true,
      value: { year: 2019, month: 4 },
    })
  })

  it('開始より前の月は拒否し(明治元年1月)、開始境界月は許容する(明治元年10月)', () => {
    const r = warekiToGregorian({ era: '明治', year: 1, month: 1 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('明治は明治元年10月23日から')
    expect(warekiToGregorian({ era: '明治', year: 1, month: 10 })).toEqual({
      ok: true,
      value: { year: 1868, month: 10 },
    })
  })

  it('立年改元の慣行表記(明治元年5月)は受理しない(日付レベルの拒否と一貫)', () => {
    expect(warekiToGregorian({ era: '明治', year: 1, month: 5 }).ok).toBe(false)
  })

  it('年のみの入力は従来どおり境界に関わらず通る(昭和64年)', () => {
    expect(warekiToGregorian({ era: '昭和', year: 64 })).toEqual({
      ok: true,
      value: { year: 1989 },
    })
  })
})

describe('warekiToGregorian: 現行元号の年上限なし', () => {
  it('令和9年など未来の年も受理する(西暦の未来年入力と整合)', () => {
    expect(warekiToGregorian({ era: '令和', year: 9 })).toEqual({
      ok: true,
      value: { year: 2027 },
    })
    expect(
      warekiToGregorian({ era: '令和', year: 100, month: 1, day: 1 }),
    ).toEqual({
      ok: true,
      value: { year: 2118, month: 1, day: 1 },
    })
  })

  it('終了日が確定している元号は従来どおり上限を守る(平成は31年まで)', () => {
    const r = warekiToGregorian({ era: '平成', year: 32 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('平成は31年まで')
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
    expect(formatWareki({ era: '令和', year: 1, month: 5, day: 1 })).toBe(
      '令和元年5月1日',
    )
    expect(formatWareki({ era: '昭和', year: 39, month: 10, day: 10 })).toBe(
      '昭和39年10月10日',
    )
    expect(formatWareki({ era: '平成', year: 5 })).toBe('平成5年')
    expect(formatGregorian({ year: 1964, month: 10 })).toBe('1964年10月')
  })
})

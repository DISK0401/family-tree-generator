import { describe, expect, it } from 'vitest'
import {
  ERA_TABLE,
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
    const r = warekiToGregorian({ era: '徳川', year: 3 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('徳川')
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

  it('江戸期以前も変換できる(1850年 → 嘉永3年)', () => {
    expect(gregorianToWareki({ year: 1850 })).toEqual({ era: '嘉永', year: 3 })
  })

  it('大化(645年)より前はnull(西暦のみで扱う)', () => {
    expect(gregorianToWareki({ year: 644 })).toBeNull()
    expect(gregorianToWareki({ year: 645, month: 6, day: 18 })).toBeNull()
  })

  it('元号が停止していた空位期間はnull(白雉〜朱鳥・朱鳥〜大宝)', () => {
    expect(gregorianToWareki({ year: 660 })).toBeNull()
    expect(gregorianToWareki({ year: 695 })).toBeNull()
  })
})

describe('ERA_TABLEの整合性', () => {
  const toOrdinal = (d: { year: number; month: number; day: number }) =>
    d.year * 10000 + d.month * 100 + d.day

  /**
   * 名目上の翌日。明治より前の行は旧暦の改元年月日をそのまま保持しており、旧暦の
   * 月の日数(29日/30日)は確定できないため「各月30日まで」として繰り上げる。
   * end は次の元号の開始日から同じ規則で導出されているため過不足なく検査できる。
   * 明治以降の実グレゴリオ暦の境界日(10/22・7/29・12/24・1/7・4/30)はいずれも
   * この規則でも同じ繰り上がりになるため、全期間を単一の規則で検査できる
   */
  function nextNominalDay(d: { year: number; month: number; day: number }) {
    if (d.day < 30) return { year: d.year, month: d.month, day: d.day + 1 }
    if (d.month < 12) return { year: d.year, month: d.month + 1, day: 1 }
    return { year: d.year + 1, month: 1, day: 1 }
  }

  it('元号名が重複していない', () => {
    const names = ERA_TABLE.map((e) => e.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('大化(645年)〜令和の全元号を収録している', () => {
    expect(ERA_TABLE).toHaveLength(239)
    expect(ERA_TABLE[0].name).toBe('令和')
    expect(ERA_TABLE.at(-1)).toEqual({
      name: '大化',
      start: { year: 645, month: 6, day: 19 },
      end: { year: 650, month: 2, day: 14 },
    })
  })

  it('現行元号(令和)以外はすべてendを持つ', () => {
    expect(ERA_TABLE.filter((e) => !e.end).map((e) => e.name)).toEqual(['令和'])
  })

  it('各元号のstartはend(存在する場合)より前である', () => {
    for (const era of ERA_TABLE) {
      if (!era.end) continue
      expect(toOrdinal(era.start), era.name).toBeLessThan(toOrdinal(era.end))
    }
  })

  it('隣接する元号が隙間・重複なく連続している(空位は白雉・朱鳥の後のみ)', () => {
    for (let i = 0; i + 1 < ERA_TABLE.length; i++) {
      const newer = ERA_TABLE[i]
      const older = ERA_TABLE[i + 1]
      expect(older.end, `${older.name} に end がない`).toBeDefined()
      if (older.name === '白雉' || older.name === '朱鳥') {
        // 斉明天皇重祚〜朱鳥、天武天皇崩御の翌年〜大宝は元号が停止していた(空位)
        expect(toOrdinal(older.end!)).toBeLessThan(toOrdinal(newer.start))
        continue
      }
      expect(
        nextNominalDay(older.end!),
        `${older.name} → ${newer.name} の境界`,
      ).toEqual(newer.start)
    }
  })
})

describe('warekiToGregorian: 江戸期以前の元号', () => {
  it('江戸後期の元号を変換できる(文久2年5月10日 → 1862年5月10日)', () => {
    expect(
      warekiToGregorian({ era: '文久', year: 2, month: 5, day: 10 }),
    ).toEqual({
      ok: true,
      value: { year: 1862, month: 5, day: 10 },
    })
  })

  it('慶応を変換でき、年上限(4年)を守る', () => {
    expect(warekiToGregorian({ era: '慶応', year: 3 })).toEqual({
      ok: true,
      value: { year: 1867 },
    })
    const over = warekiToGregorian({ era: '慶応', year: 5 })
    expect(over.ok).toBe(false)
    if (!over.ok) expect(over.message).toContain('慶応は4年まで')
  })

  it('年またぎ改元でも元年は慣用の西暦年に対応する(天保元年=1830年)', () => {
    // 天保改元(文政13年12月10日)のグレゴリオ暦換算は1831年1月23日だが、
    // テーブルは旧暦の年月日を名目上の日付として保持するため慣用の年対応で変換される
    expect(
      warekiToGregorian({ era: '天保', year: 1, month: 12, day: 15 }),
    ).toEqual({
      ok: true,
      value: { year: 1830, month: 12, day: 15 },
    })
    expect(warekiToGregorian({ era: '天保', year: 7 })).toEqual({
      ok: true,
      value: { year: 1836 },
    })
  })

  it('北朝系列の改元境界(康応→明徳)', () => {
    expect(
      warekiToGregorian({ era: '康応', year: 2, month: 3, day: 25 }).ok,
    ).toBe(true)
    expect(
      warekiToGregorian({ era: '康応', year: 2, month: 3, day: 26 }).ok,
    ).toBe(false)
    expect(
      warekiToGregorian({ era: '明徳', year: 1, month: 3, day: 26 }),
    ).toEqual({
      ok: true,
      value: { year: 1390, month: 3, day: 26 },
    })
  })

  it('最古の元号(大化)の開始境界(大化元年6月19日)', () => {
    expect(
      warekiToGregorian({ era: '大化', year: 1, month: 6, day: 19 }),
    ).toEqual({
      ok: true,
      value: { year: 645, month: 6, day: 19 },
    })
    expect(
      warekiToGregorian({ era: '大化', year: 1, month: 6, day: 18 }).ok,
    ).toBe(false)
  })

  it('慶応4年の旧暦表記は明治開始日(1868年10月23日)の前日まで受理する', () => {
    expect(
      warekiToGregorian({ era: '慶応', year: 4, month: 9, day: 20 }).ok,
    ).toBe(true)
    expect(
      warekiToGregorian({ era: '慶応', year: 4, month: 10, day: 22 }).ok,
    ).toBe(true)
    expect(
      warekiToGregorian({ era: '慶応', year: 4, month: 10, day: 23 }).ok,
    ).toBe(false)
  })

  it('南朝の元号(天授)には対応しない', () => {
    const r = warekiToGregorian({ era: '天授', year: 2 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toBe('元号「天授」には対応していません')
  })

  it('元弘と並立していた北朝の正慶には対応しない', () => {
    expect(warekiToGregorian({ era: '正慶', year: 2 }).ok).toBe(false)
  })
})

describe('warekiToGregorian: 明治6年より前の暦法非依存の日付検査', () => {
  it('旧暦にあり得る日(安政3年2月30日)はグレゴリオ暦の月日数を超えても受理する', () => {
    expect(
      warekiToGregorian({ era: '安政', year: 3, month: 2, day: 30 }),
    ).toEqual({
      ok: true,
      value: { year: 1856, month: 2, day: 30 },
    })
  })

  it('旧暦の範囲(1〜30日)を超える日(安政3年2月31日)は拒否する', () => {
    const r = warekiToGregorian({ era: '安政', year: 3, month: 2, day: 31 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('存在しない日付です')
  })

  it('明治5年(1872年)までは旧暦として緩く検査し、明治6年(1873年)からは実在検査する', () => {
    expect(
      warekiToGregorian({ era: '明治', year: 5, month: 2, day: 30 }).ok,
    ).toBe(true)
    expect(
      warekiToGregorian({ era: '明治', year: 6, month: 2, day: 30 }).ok,
    ).toBe(false)
  })

  it('月の範囲(1〜12)は明治6年より前でも検査する', () => {
    expect(
      warekiToGregorian({ era: '安政', year: 3, month: 13, day: 1 }).ok,
    ).toBe(false)
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

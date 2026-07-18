import type { CalendarDate } from './types'

/**
 * 和暦⇄西暦の相互変換。
 * 元号は静的テーブルで管理し、行を追加するだけで古い元号へ拡張できる。
 * 改元境界日は「その元号が有効な最初の日/最後の日」で表す。
 */

export interface Era {
  name: string
  /** この元号の最初の有効日 */
  start: { year: number; month: number; day: number }
  /** この元号の最後の有効日(現行元号は未設定) */
  end?: { year: number; month: number; day: number }
}

/** 新しい元号ほど先頭。江戸期以前へ拡張する場合は末尾に行を追加する */
export const ERA_TABLE: Era[] = [
  { name: '令和', start: { year: 2019, month: 5, day: 1 } },
  { name: '平成', start: { year: 1989, month: 1, day: 8 }, end: { year: 2019, month: 4, day: 30 } },
  { name: '昭和', start: { year: 1926, month: 12, day: 25 }, end: { year: 1989, month: 1, day: 7 } },
  { name: '大正', start: { year: 1912, month: 7, day: 30 }, end: { year: 1926, month: 12, day: 24 } },
  { name: '明治', start: { year: 1868, month: 10, day: 23 }, end: { year: 1912, month: 7, day: 29 } },
]

export interface WarekiDate {
  era: string
  /** 元号内の年(元年 = 1) */
  year: number
  month?: number
  day?: number
}

export type WarekiResult<T> = { ok: true; value: T } | { ok: false; message: string }

function toOrdinal(d: { year: number; month: number; day: number }): number {
  return d.year * 10000 + d.month * 100 + d.day
}

function maxEraYear(era: Era): number {
  return era.end ? era.end.year - era.start.year + 1 : new Date().getFullYear() - era.start.year + 1
}

function isValidCalendarDate(year: number, month?: number, day?: number): boolean {
  if (month === undefined) return true
  if (month < 1 || month > 12) return false
  if (day === undefined) return true
  const daysInMonth = new Date(year, month, 0).getDate()
  return day >= 1 && day <= daysInMonth
}

export function findEra(name: string): Era | undefined {
  return ERA_TABLE.find((e) => e.name === name)
}

/** 和暦→西暦。部分日付(年のみ・年月のみ)を許容し、範囲外・存在しない日付はエラーで報告する */
export function warekiToGregorian(wareki: WarekiDate): WarekiResult<CalendarDate> {
  const era = findEra(wareki.era)
  if (!era) return { ok: false, message: `元号「${wareki.era}」には対応していません` }
  if (!Number.isInteger(wareki.year) || wareki.year < 1) {
    return { ok: false, message: `${era.name}の年は元年(1年)以降で入力してください` }
  }
  const max = maxEraYear(era)
  if (wareki.year > max) {
    return { ok: false, message: `${era.name}は${max}年までです(${era.name}${wareki.year}年は存在しません)` }
  }
  const year = era.start.year + wareki.year - 1
  if (!isValidCalendarDate(year, wareki.month, wareki.day)) {
    return { ok: false, message: `存在しない日付です(${year}年${wareki.month}月${wareki.day}日)` }
  }
  if (wareki.month !== undefined && wareki.day !== undefined) {
    const ord = toOrdinal({ year, month: wareki.month, day: wareki.day })
    if (ord < toOrdinal(era.start)) {
      const s = era.start
      return {
        ok: false,
        message: `${era.name}は${era.name}元年${s.month}月${s.day}日からです`,
      }
    }
    if (era.end && ord > toOrdinal(era.end)) {
      const e = era.end
      return {
        ok: false,
        message: `${era.name}は${era.name}${max}年${e.month}月${e.day}日までです`,
      }
    }
  }
  return { ok: true, value: { year, ...(wareki.month !== undefined && { month: wareki.month }), ...(wareki.day !== undefined && { day: wareki.day }) } }
}

/**
 * 西暦→和暦。テーブル範囲外(明治より前)は null を返す。
 * 年のみの入力で改元年(例: 1989)にあたる場合は、その年の12月31日時点の元号で表す。
 */
export function gregorianToWareki(date: CalendarDate): WarekiDate | null {
  const ord = toOrdinal({ year: date.year, month: date.month ?? 12, day: date.day ?? 31 })
  for (const era of ERA_TABLE) {
    if (ord < toOrdinal(era.start)) continue
    if (era.end && ord > toOrdinal(era.end)) continue
    return {
      era: era.name,
      year: date.year - era.start.year + 1,
      ...(date.month !== undefined && { month: date.month }),
      ...(date.day !== undefined && { day: date.day }),
    }
  }
  return null
}

/** 「昭和39年10月10日」形式。元年は「元年」と表記する */
export function formatWareki(w: WarekiDate): string {
  const y = w.year === 1 ? '元' : String(w.year)
  let s = `${w.era}${y}年`
  if (w.month !== undefined) s += `${w.month}月`
  if (w.day !== undefined) s += `${w.day}日`
  return s
}

/** 「1964年10月10日」形式 */
export function formatGregorian(d: CalendarDate): string {
  let s = `${d.year}年`
  if (d.month !== undefined) s += `${d.month}月`
  if (d.day !== undefined) s += `${d.day}日`
  return s
}

import type { CalendarDate, FuzzyDate, Person } from './types'

type FullDate = CalendarDate & { month: number; day: number }

function isFullDate(date: CalendarDate | undefined): date is FullDate {
  return (
    date !== undefined && date.month !== undefined && date.day !== undefined
  )
}

/**
 * 年齢計算に使ってよい確定した完全日付のみを返す。
 * 「頃」「以前」「以後」「〜」(exact以外のqualifier)の日付は、たとえ年月日が揃っていても
 * 不確実な値のため、そこから計算した年齢を確定値のように表示すると誤解を招く。
 * 年のみの日付と同じく計算しない扱いに倒す(design.md D8 の趣旨)
 */
function exactFullDate(fuzzy: FuzzyDate | undefined): FullDate | undefined {
  if (fuzzy === undefined || fuzzy.qualifier !== 'exact') return undefined
  return isFullDate(fuzzy.date) ? fuzzy.date : undefined
}

function toOrdinal(d: FullDate): number {
  return d.year * 10000 + d.month * 100 + d.day
}

function ageBetween(birth: FullDate, end: FullDate): number {
  let age = end.year - birth.year
  const hadBirthdayByEnd =
    end.month > birth.month ||
    (end.month === birth.month && end.day >= birth.day)
  if (!hadBirthdayByEnd) age -= 1
  return age
}

/**
 * 現年齢(故人の場合は没年齢)を計算する(design.md D8)。
 * 生年月日・没年月日のいずれかが年のみ(月日不明)しか判明していない場合や、
 * qualifierが'exact'以外(頃・以前など)の場合は、誤解を招く確定表示を避けるため
 * `undefined`を返す。
 */
export function computeAge(
  person: Person,
  today: Date = new Date(),
): number | undefined {
  const birth = exactFullDate(person.birth?.date)
  if (birth === undefined) return undefined

  if (person.death) {
    const death = exactFullDate(person.death.date)
    if (death === undefined) return undefined
    // 生没逆転(没年月日が生年月日より前)は入力誤りであり、負の年齢を表示しない
    if (toOrdinal(death) < toOrdinal(birth)) return undefined
    return ageBetween(birth, death)
  }

  return ageBetween(birth, {
    year: today.getFullYear(),
    month: today.getMonth() + 1,
    day: today.getDate(),
  })
}

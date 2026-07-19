import type { CalendarDate, Person } from './types'

type FullDate = CalendarDate & { month: number; day: number }

function isFullDate(date: CalendarDate | undefined): date is FullDate {
  return date !== undefined && date.month !== undefined && date.day !== undefined
}

function ageBetween(birth: FullDate, end: FullDate): number {
  let age = end.year - birth.year
  const hadBirthdayByEnd = end.month > birth.month || (end.month === birth.month && end.day >= birth.day)
  if (!hadBirthdayByEnd) age -= 1
  return age
}

/**
 * 現年齢(故人の場合は没年齢)を計算する(design.md D8)。
 * 生年月日・没年月日のいずれかが年のみ(月日不明)しか判明していない場合は、
 * 誤解を招く概算表示を避けるため`undefined`を返す。
 */
export function computeAge(person: Person, today: Date = new Date()): number | undefined {
  const birth = person.birth?.date?.date
  if (!isFullDate(birth)) return undefined

  if (person.death) {
    const death = person.death.date?.date
    if (!isFullDate(death)) return undefined
    return ageBetween(birth, death)
  }

  return ageBetween(birth, { year: today.getFullYear(), month: today.getMonth() + 1, day: today.getDate() })
}

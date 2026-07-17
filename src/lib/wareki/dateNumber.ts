/** 年月日を比較可能な単一の数値に変換する(例: 1989-01-08 -> 19890108)。 */
export function dateNumber(year: number, month = 1, day = 1): number {
  return year * 10000 + month * 100 + day
}

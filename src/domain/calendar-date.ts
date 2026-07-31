/**
 * グレゴリオ暦の部分日付(年のみ・年月のみを許容)の実在検査。
 * wareki.ts(和暦→西暦の結果検査)と parse-date.ts(西暦入力の検査)の双方で使う
 * 共通処理。同一ロジックの重複定義が将来の修正漏れ(片方だけ直る)を生まないよう切り出す。
 */
export function isValidCalendarDate(
  year: number,
  month?: number,
  day?: number,
): boolean {
  if (month === undefined) return true
  if (month < 1 || month > 12) return false
  if (day === undefined) return true
  const daysInMonth = new Date(year, month, 0).getDate()
  return day >= 1 && day <= daysInMonth
}

/** 明治6年1月1日にグレゴリオ暦(新暦)へ移行した年 */
export const GREGORIAN_CALENDAR_ADOPTION_YEAR = 1873

/**
 * 年に応じて暦法を選ぶ実在検査。明治6年(1873年)のグレゴリオ暦採用より前は
 * 旧暦(太陰太陽暦)の日付であり、月の日数(29日/30日)がグレゴリオ暦の同名月と
 * 一致しないため、実在した旧暦日(例: 2月30日)を誤って拒否しないよう暦法非依存の
 * 範囲検査(月1〜12・日1〜30)に切り替える。小の月の30日など実在しなかった日も
 * 通す緩さは意図したトレードオフ(旧暦の暦計算は行わない)。閏月は扱わない。
 * 1873年以降は従来どおり isValidCalendarDate で検査する。
 */
export function isValidDateForYear(
  year: number,
  month?: number,
  day?: number,
): boolean {
  if (year >= GREGORIAN_CALENDAR_ADOPTION_YEAR) {
    return isValidCalendarDate(year, month, day)
  }
  if (month === undefined) return true
  if (month < 1 || month > 12) return false
  if (day === undefined) return true
  return day >= 1 && day <= 30
}

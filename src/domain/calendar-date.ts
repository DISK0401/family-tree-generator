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

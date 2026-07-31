import { isValidDateForYear } from './calendar-date'
import type { CalendarDate, DateQualifier, FuzzyDate } from './types'
import { warekiToGregorian, type WarekiResult } from './wareki'

/**
 * 日付文字列 → FuzzyDate のパース。
 * 和暦(昭和39年10月10日)・西暦(1964年10月10日 / 1964-10-10 / 1964)の両方と、
 * 修飾子(頃・以前・以後/以降・「A〜B」の範囲)を受け付ける。
 * 入力原文は FuzzyDate.original にそのまま保持する。
 */

/** 範囲区切り。波ダッシュ・全角チルダに加え、半角チルダ(~)も同じ意図の入力として受け付ける */
const RANGE_SEPARATOR = /[〜~~]/

function toHalfWidth(s: string): string {
  // 全角数字(U+FF10〜U+FF19)を半角へ
  return s.replace(/[０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0),
  )
}

interface QualifierMatch {
  qualifier: Exclude<DateQualifier, 'between'>
  core: string
}

function stripQualifier(input: string): QualifierMatch {
  const s = input.trim()
  if (/(頃|ころ|ごろ)$/.test(s))
    return { qualifier: 'about', core: s.replace(/(頃|ころ|ごろ)$/, '').trim() }
  if (/以前$/.test(s))
    return { qualifier: 'before', core: s.replace(/以前$/, '').trim() }
  if (/(以後|以降)$/.test(s))
    return { qualifier: 'after', core: s.replace(/(以後|以降)$/, '').trim() }
  return { qualifier: 'exact', core: s }
}

// 元号は「漢字列+年」の形で受け、実在するかどうかは warekiToGregorian に委ねる。
// ERA_TABLE の元号名を列挙する方式だと、未収録の元号(南朝の「天授」など)が
// 「日付を読み取れません」という一般エラーになってしまい、「元号「天授」には
// 対応していません」という具体的な理由を返せない(spec: 南朝の元号は非対応)
const WAREKI_RE =
  /^([一-鿿々]+?)(元|\d{1,2})年(?:(\d{1,2})月(?:(\d{1,2})日)?)?$/
// 西暦年は4桁のみ受け付ける。3桁年(196年 等)は史実として存在し得るが、家系図の入力では
// 「1964」の打ち損じである可能性のほうが圧倒的に高く、誤入力の検出を優先して拒否する
// (3桁年を扱いたい史料は原文のまま保持する運用に頼る)
const GREGORIAN_KANJI_RE = /^(\d{4})年(?:(\d{1,2})月(?:(\d{1,2})日)?)?$/
const GREGORIAN_SEP_RE = /^(\d{4})(?:[/-](\d{1,2})(?:[/-](\d{1,2}))?)?$/
/** 区切りなし8桁数字(例: 19641010)。曖昧さを避けるため4桁年+2桁月+2桁日のみを対象とする */
const GREGORIAN_COMPACT_RE = /^(\d{4})(\d{2})(\d{2})$/

/** 単一の日付表記(修飾子・範囲を除いた部分)をグレゴリオ暦へ */
function parseCore(core: string): WarekiResult<CalendarDate> {
  const s = toHalfWidth(core.trim())
  if (!s) return { ok: false, message: '日付を入力してください' }

  const w = WAREKI_RE.exec(s)
  if (w) {
    const [, era, y, m, d] = w
    return warekiToGregorian({
      era,
      year: y === '元' ? 1 : Number(y),
      ...(m !== undefined && { month: Number(m) }),
      ...(d !== undefined && { day: Number(d) }),
    })
  }

  const g =
    GREGORIAN_KANJI_RE.exec(s) ??
    GREGORIAN_SEP_RE.exec(s) ??
    GREGORIAN_COMPACT_RE.exec(s)
  if (g) {
    const [, y, m, d] = g
    const date: CalendarDate = {
      year: Number(y),
      ...(m !== undefined && { month: Number(m) }),
      ...(d !== undefined && { day: Number(d) }),
    }
    // 明治6年(1873年)より前は旧暦の日付として暦法非依存の緩い検査になる(calendar-date.ts参照)
    if (!isValidDateForYear(date.year, date.month, date.day)) {
      return { ok: false, message: `存在しない日付です(${s})` }
    }
    return { ok: true, value: date }
  }

  return {
    ok: false,
    message:
      '日付を読み取れません(例: 昭和39年10月10日 / 1964年10月10日 / 1964-10-10)',
  }
}

/** 範囲の前後判定用の比較キー。部分日付は月日を0として「その年(月)の先頭」とみなす */
function calendarSortKey(d: CalendarDate): number {
  return d.year * 10000 + (d.month ?? 0) * 100 + (d.day ?? 0)
}

/** 入力文字列をFuzzyDateへパースする。失敗時は理由つきエラーを返す */
export function parseDateInput(input: string): WarekiResult<FuzzyDate> {
  const original = input.trim()
  if (!original) return { ok: false, message: '日付を入力してください' }

  const rangeParts = original.split(RANGE_SEPARATOR)
  if (rangeParts.length === 2) {
    const from = parseCore(stripQualifier(rangeParts[0]).core)
    if (!from.ok) return from
    const to = parseCore(stripQualifier(rangeParts[1]).core)
    if (!to.ok) return to
    // GEDCOMのBET A AND BはA≦Bが前提のため、逆順の入力(1970〜1960)は開始・終了を
    // 入れ替えて正規化して受理する。意図に曖昧さがなく、拒否しても打ち直させるだけのため
    const reversed = calendarSortKey(from.value) > calendarSortKey(to.value)
    const [start, end] = reversed
      ? [to.value, from.value]
      : [from.value, to.value]
    return {
      ok: true,
      value: { original, qualifier: 'between', date: start, date2: end },
    }
  }

  const { qualifier, core } = stripQualifier(original)
  const parsed = parseCore(core)
  if (!parsed.ok) return parsed
  return { ok: true, value: { original, qualifier, date: parsed.value } }
}

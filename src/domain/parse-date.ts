import type { CalendarDate, DateQualifier, FuzzyDate } from './types'
import { ERA_TABLE, warekiToGregorian, type WarekiResult } from './wareki'

/**
 * 日付文字列 → FuzzyDate のパース。
 * 和暦(昭和39年10月10日)・西暦(1964年10月10日 / 1964-10-10 / 1964)の両方と、
 * 修飾子(頃・以前・以後/以降・「A〜B」の範囲)を受け付ける。
 * 入力原文は FuzzyDate.original にそのまま保持する。
 */

const RANGE_SEPARATOR = /[〜~]/

function toHalfWidth(s: string): string {
  // 全角数字(U+FF10〜U+FF19)を半角へ
  return s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
}

interface QualifierMatch {
  qualifier: Exclude<DateQualifier, 'between'>
  core: string
}

function stripQualifier(input: string): QualifierMatch {
  const s = input.trim()
  if (/(頃|ころ|ごろ)$/.test(s)) return { qualifier: 'about', core: s.replace(/(頃|ころ|ごろ)$/, '').trim() }
  if (/以前$/.test(s)) return { qualifier: 'before', core: s.replace(/以前$/, '').trim() }
  if (/(以後|以降)$/.test(s)) return { qualifier: 'after', core: s.replace(/(以後|以降)$/, '').trim() }
  return { qualifier: 'exact', core: s }
}

const eraNames = ERA_TABLE.map((e) => e.name).join('|')
const WAREKI_RE = new RegExp(`^(${eraNames})(元|\\d{1,2})年(?:(\\d{1,2})月(?:(\\d{1,2})日)?)?$`)
const GREGORIAN_KANJI_RE = /^(\d{3,4})年(?:(\d{1,2})月(?:(\d{1,2})日)?)?$/
const GREGORIAN_SEP_RE = /^(\d{3,4})(?:[/-](\d{1,2})(?:[/-](\d{1,2}))?)?$/
/** 区切りなし8桁数字(例: 19641010)。曖昧さを避けるため4桁年+2桁月+2桁日のみを対象とする */
const GREGORIAN_COMPACT_RE = /^(\d{4})(\d{2})(\d{2})$/

function isValidCalendarDate(year: number, month?: number, day?: number): boolean {
  if (month === undefined) return true
  if (month < 1 || month > 12) return false
  if (day === undefined) return true
  const daysInMonth = new Date(year, month, 0).getDate()
  return day >= 1 && day <= daysInMonth
}

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

  const g = GREGORIAN_KANJI_RE.exec(s) ?? GREGORIAN_SEP_RE.exec(s) ?? GREGORIAN_COMPACT_RE.exec(s)
  if (g) {
    const [, y, m, d] = g
    const date: CalendarDate = {
      year: Number(y),
      ...(m !== undefined && { month: Number(m) }),
      ...(d !== undefined && { day: Number(d) }),
    }
    if (!isValidCalendarDate(date.year, date.month, date.day)) {
      return { ok: false, message: `存在しない日付です(${s})` }
    }
    return { ok: true, value: date }
  }

  return {
    ok: false,
    message: '日付を読み取れません(例: 昭和39年10月10日 / 1964年10月10日 / 1964-10-10)',
  }
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
    return {
      ok: true,
      value: { original, qualifier: 'between', date: from.value, date2: to.value },
    }
  }

  const { qualifier, core } = stripQualifier(original)
  const parsed = parseCore(core)
  if (!parsed.ok) return parsed
  return { ok: true, value: { original, qualifier, date: parsed.value } }
}

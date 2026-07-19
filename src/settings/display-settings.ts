import type { CalendarDate } from '../domain/types'
import { formatWareki, gregorianToWareki } from '../domain/wareki'

/**
 * 表示設定(design.md D9)。生年月日・没年月日をカードに表示する粒度・和暦表示の可否・
 * カードへ表示する項目を保持する。
 * 家系図データ(TreeDocument、IndexedDB)とは独立した端末ローカルのUI設定として
 * localStorageに保存し、undo/redo履歴の対象にしない。
 */

export type DateGranularity = 'year' | 'year-month' | 'full'

/** カードの日付表記形式(design.md D4) */
export type CalendarMode = 'gregorian' | 'wareki'

/** カードへ表示する項目の個別トグル(design.md D8) */
export interface CardFieldVisibility {
  surname: boolean
  given: boolean
  furigana: boolean
  birthDate: boolean
  deathDate: boolean
  birthPlace: boolean
  deathPlace: boolean
  age: boolean
  genderIcon: boolean
}

export interface DisplaySettings {
  birthDateGranularity: DateGranularity
  deathDateGranularity: DateGranularity
  calendarMode: CalendarMode
  visibleCardFields: CardFieldVisibility
}

/** 現状のカード表示と完全に一致させる(design.md D8) */
export const DEFAULT_VISIBLE_CARD_FIELDS: CardFieldVisibility = {
  surname: true,
  given: true,
  furigana: false,
  birthDate: true,
  deathDate: true,
  birthPlace: false,
  deathPlace: false,
  age: true,
  genderIcon: true,
}

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  birthDateGranularity: 'full',
  deathDateGranularity: 'full',
  calendarMode: 'gregorian',
  visibleCardFields: DEFAULT_VISIBLE_CARD_FIELDS,
}

const STORAGE_KEY = 'family-tree-generator:display-settings'
const GRANULARITIES: readonly DateGranularity[] = ['year', 'year-month', 'full']
const CALENDAR_MODES: readonly CalendarMode[] = ['gregorian', 'wareki']
const CARD_FIELD_KEYS = Object.keys(DEFAULT_VISIBLE_CARD_FIELDS) as (keyof CardFieldVisibility)[]

function isGranularity(value: unknown): value is DateGranularity {
  return typeof value === 'string' && (GRANULARITIES as readonly string[]).includes(value)
}

function isCalendarMode(value: unknown): value is CalendarMode {
  return typeof value === 'string' && (CALENDAR_MODES as readonly string[]).includes(value)
}

/** キー単位でフォールバックする(未保存・不正な項目のみデフォルト値を補う。design.md Migration Plan) */
function parseVisibleCardFields(value: unknown): CardFieldVisibility {
  if (typeof value !== 'object' || value === null) return DEFAULT_VISIBLE_CARD_FIELDS
  const record = value as Record<string, unknown>
  const result = { ...DEFAULT_VISIBLE_CARD_FIELDS }
  for (const key of CARD_FIELD_KEYS) {
    if (typeof record[key] === 'boolean') result[key] = record[key] as boolean
  }
  return result
}

/** 保存済み設定を読み込む。未保存・不正な内容の場合はデフォルト値を返す */
export function loadDisplaySettings(): DisplaySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_DISPLAY_SETTINGS
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_DISPLAY_SETTINGS
    const { birthDateGranularity, deathDateGranularity, calendarMode, visibleCardFields } =
      parsed as Record<string, unknown>
    if (!isGranularity(birthDateGranularity) || !isGranularity(deathDateGranularity)) {
      return DEFAULT_DISPLAY_SETTINGS
    }
    return {
      birthDateGranularity,
      deathDateGranularity,
      calendarMode: isCalendarMode(calendarMode) ? calendarMode : DEFAULT_DISPLAY_SETTINGS.calendarMode,
      visibleCardFields: parseVisibleCardFields(visibleCardFields),
    }
  } catch {
    return DEFAULT_DISPLAY_SETTINGS
  }
}

export function saveDisplaySettings(settings: DisplaySettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // 保存に失敗しても表示自体は継続できるため、例外は握りつぶす(privateモード等でのquota超過を想定)
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * 表示粒度・和暦表示モードに応じて日付を書式化する(design.md D9/D4)。
 * 実際のデータの精度(月日が判明しているか)と、指定された粒度の両方でより粗い方に丸めたうえで
 * (粒度が「年月日まで」でも、データが年のみしか無ければ年のみ表示する)、和暦表示モードが
 * 指定されていれば和暦表記に変換する。改元境界日の判定精度を保つため、和暦変換は必ず
 * 粒度丸めの後に行う(design.md D4)。元号テーブルの範囲外(明治より前)の日付は
 * 和暦表示モードでも西暦表記にフォールバックする(design.md D5)。
 */
export function formatDateForDisplay(
  date: CalendarDate | undefined,
  granularity: DateGranularity,
  calendarMode: CalendarMode = 'gregorian',
): string | undefined {
  if (!date) return undefined
  const rounded: CalendarDate =
    granularity === 'year' || date.month === undefined
      ? { year: date.year }
      : granularity === 'year-month' || date.day === undefined
        ? { year: date.year, month: date.month }
        : { year: date.year, month: date.month, day: date.day }

  if (calendarMode === 'wareki') {
    const wareki = gregorianToWareki(rounded)
    if (wareki) return formatWareki(wareki)
  }

  if (rounded.month === undefined) return String(rounded.year)
  if (rounded.day === undefined) return `${rounded.year}-${pad2(rounded.month)}`
  return `${rounded.year}-${pad2(rounded.month)}-${pad2(rounded.day)}`
}

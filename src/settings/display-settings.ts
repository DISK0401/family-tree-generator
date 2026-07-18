import type { CalendarDate } from '../domain/types'

/**
 * 表示設定(design.md D9)。生年月日・没年月日をカードに表示する粒度を保持する。
 * 家系図データ(TreeDocument、IndexedDB)とは独立した端末ローカルのUI設定として
 * localStorageに保存し、undo/redo履歴の対象にしない。
 */

export type DateGranularity = 'year' | 'year-month' | 'full'

export interface DisplaySettings {
  birthDateGranularity: DateGranularity
  deathDateGranularity: DateGranularity
}

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  birthDateGranularity: 'full',
  deathDateGranularity: 'full',
}

const STORAGE_KEY = 'family-tree-generator:display-settings'
const GRANULARITIES: readonly DateGranularity[] = ['year', 'year-month', 'full']

function isGranularity(value: unknown): value is DateGranularity {
  return typeof value === 'string' && (GRANULARITIES as readonly string[]).includes(value)
}

/** 保存済み設定を読み込む。未保存・不正な内容の場合はデフォルト値を返す */
export function loadDisplaySettings(): DisplaySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_DISPLAY_SETTINGS
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_DISPLAY_SETTINGS
    const { birthDateGranularity, deathDateGranularity } = parsed as Record<string, unknown>
    if (!isGranularity(birthDateGranularity) || !isGranularity(deathDateGranularity)) {
      return DEFAULT_DISPLAY_SETTINGS
    }
    return { birthDateGranularity, deathDateGranularity }
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
 * 表示粒度に応じて日付を書式化する(design.md D9)。
 * 実際のデータの精度(月日が判明しているか)と、指定された粒度の両方でより粗い方に丸める
 * (粒度が「年月日まで」でも、データが年のみしか無ければ年のみ表示する)。
 */
export function formatDateForDisplay(
  date: CalendarDate | undefined,
  granularity: DateGranularity,
): string | undefined {
  if (!date) return undefined
  if (granularity === 'year' || date.month === undefined) return String(date.year)
  if (granularity === 'year-month' || date.day === undefined) return `${date.year}-${pad2(date.month)}`
  return `${date.year}-${pad2(date.month)}-${pad2(date.day)}`
}

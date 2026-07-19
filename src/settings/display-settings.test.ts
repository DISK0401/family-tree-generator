import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_DISPLAY_SETTINGS,
  DEFAULT_VISIBLE_CARD_FIELDS,
  formatDateForDisplay,
  loadDisplaySettings,
  saveDisplaySettings,
} from './display-settings'

describe('display-settings', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('未保存の場合はデフォルト値(年月日まで・西暦)を返す', () => {
    expect(loadDisplaySettings()).toEqual(DEFAULT_DISPLAY_SETTINGS)
  })

  it('保存した設定をそのまま復元できる', () => {
    saveDisplaySettings({
      birthDateGranularity: 'year',
      deathDateGranularity: 'year-month',
      calendarMode: 'wareki',
      visibleCardFields: { ...DEFAULT_VISIBLE_CARD_FIELDS, furigana: true },
    })
    expect(loadDisplaySettings()).toEqual({
      birthDateGranularity: 'year',
      deathDateGranularity: 'year-month',
      calendarMode: 'wareki',
      visibleCardFields: { ...DEFAULT_VISIBLE_CARD_FIELDS, furigana: true },
    })
  })

  it('壊れたJSONの場合はデフォルト値にフォールバックする', () => {
    localStorage.setItem('family-tree-generator:display-settings', '{not valid json')
    expect(loadDisplaySettings()).toEqual(DEFAULT_DISPLAY_SETTINGS)
  })

  it('不正な粒度の値が含まれる場合はデフォルト値にフォールバックする', () => {
    localStorage.setItem(
      'family-tree-generator:display-settings',
      JSON.stringify({ birthDateGranularity: 'century', deathDateGranularity: 'full' }),
    )
    expect(loadDisplaySettings()).toEqual(DEFAULT_DISPLAY_SETTINGS)
  })

  it('calendarModeが未保存・不正な場合はcalendarModeのみデフォルト値にフォールバックする(粒度は維持)', () => {
    localStorage.setItem(
      'family-tree-generator:display-settings',
      JSON.stringify({ birthDateGranularity: 'year', deathDateGranularity: 'full', calendarMode: 'unknown' }),
    )
    expect(loadDisplaySettings()).toEqual({
      birthDateGranularity: 'year',
      deathDateGranularity: 'full',
      calendarMode: 'gregorian',
      visibleCardFields: DEFAULT_VISIBLE_CARD_FIELDS,
    })
  })

  it('visibleCardFieldsは項目単位でフォールバックする(有効な項目は維持、不正・未保存の項目のみデフォルト値を補う)', () => {
    localStorage.setItem(
      'family-tree-generator:display-settings',
      JSON.stringify({
        birthDateGranularity: 'full',
        deathDateGranularity: 'full',
        visibleCardFields: { surname: false, given: 'not-a-boolean', furigana: true },
      }),
    )
    expect(loadDisplaySettings().visibleCardFields).toEqual({
      ...DEFAULT_VISIBLE_CARD_FIELDS,
      surname: false,
      furigana: true,
    })
  })
})

describe('formatDateForDisplay', () => {
  const fullDate = { year: 1990, month: 5, day: 1 }

  it('日付が未設定の場合はundefinedを返す', () => {
    expect(formatDateForDisplay(undefined, 'full')).toBeUndefined()
  })

  it('粒度"year"では年のみを返す', () => {
    expect(formatDateForDisplay(fullDate, 'year')).toBe('1990')
  })

  it('粒度"year-month"では年月を返す', () => {
    expect(formatDateForDisplay(fullDate, 'year-month')).toBe('1990-05')
  })

  it('粒度"full"では年月日を返す', () => {
    expect(formatDateForDisplay(fullDate, 'full')).toBe('1990-05-01')
  })

  it('粒度が"full"でもデータが年のみしか無ければ年のみを返す', () => {
    expect(formatDateForDisplay({ year: 1900 }, 'full')).toBe('1900')
  })

  it('粒度が"full"でもデータが年月までしか無ければ年月を返す', () => {
    expect(formatDateForDisplay({ year: 1900, month: 3 }, 'full')).toBe('1900-03')
  })

  it('calendarModeを指定しない場合は西暦のまま(既存呼び出しとの後方互換)', () => {
    expect(formatDateForDisplay(fullDate, 'full')).toBe('1990-05-01')
  })

  it('和暦モードでは和暦表記に変換する', () => {
    expect(formatDateForDisplay({ year: 1964, month: 10, day: 10 }, 'full', 'wareki')).toBe('昭和39年10月10日')
  })

  it('和暦モード+粒度"year"では和暦の年のみを返す(粒度丸め→和暦変換の順、design.md D4)', () => {
    expect(formatDateForDisplay({ year: 1964, month: 10, day: 10 }, 'year', 'wareki')).toBe('昭和39年')
  })

  it('和暦モードでも元号テーブルの範囲外(明治より前)は西暦表記にフォールバックする(design.md D5)', () => {
    expect(formatDateForDisplay({ year: 1800, month: 1, day: 1 }, 'full', 'wareki')).toBe('1800-01-01')
  })
})

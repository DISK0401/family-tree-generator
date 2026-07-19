import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_DISPLAY_SETTINGS, formatDateForDisplay, loadDisplaySettings, saveDisplaySettings } from './display-settings'

describe('display-settings', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('未保存の場合はデフォルト値(年月日まで)を返す', () => {
    expect(loadDisplaySettings()).toEqual(DEFAULT_DISPLAY_SETTINGS)
  })

  it('保存した設定をそのまま復元できる', () => {
    saveDisplaySettings({ birthDateGranularity: 'year', deathDateGranularity: 'year-month' })
    expect(loadDisplaySettings()).toEqual({ birthDateGranularity: 'year', deathDateGranularity: 'year-month' })
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
})

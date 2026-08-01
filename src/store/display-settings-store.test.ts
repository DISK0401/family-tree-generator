import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addPerson } from '../domain/commands'
import { createTreeDocument } from '../domain/helpers'
import { useTreeStore } from '../store/tree-store'
import {
  DEFAULT_DISPLAY_SETTINGS,
  loadDisplaySettings,
} from './display-settings'
import { useDisplaySettingsStore } from './display-settings-store'

describe('useDisplaySettingsStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useDisplaySettingsStore.setState(DEFAULT_DISPLAY_SETTINGS)
    useTreeStore.setState({
      document: createTreeDocument(),
      past: [],
      future: [],
    })
  })

  it('表示設定の変更はTreeDocumentのundo/redo履歴に影響しない(design.md D9)', () => {
    // 家系図側で1回操作しておく
    useTreeStore
      .getState()
      .apply((doc) => addPerson(doc, { name: { given: '太郎' } }).doc)
    expect(useTreeStore.getState().canUndo()).toBe(true)
    const pastLengthBefore = useTreeStore.getState().past.length
    const documentBefore = useTreeStore.getState().document

    // 表示設定を変更する
    useDisplaySettingsStore.getState().setBirthDateGranularity('year')
    useDisplaySettingsStore.getState().setDeathDateGranularity('year-month')

    // tree-storeの履歴・documentは変化しない
    expect(useTreeStore.getState().past.length).toBe(pastLengthBefore)
    expect(useTreeStore.getState().document).toBe(documentBefore)

    // undoすると、表示設定の変更ではなく直前の人物追加のみが取り消される
    useTreeStore.getState().undo()
    expect(useTreeStore.getState().canUndo()).toBe(false)
    expect(Object.keys(useTreeStore.getState().document.persons)).toHaveLength(
      0,
    )
    // 表示設定はundoの影響を受けず維持される
    expect(useDisplaySettingsStore.getState().birthDateGranularity).toBe('year')
    expect(useDisplaySettingsStore.getState().deathDateGranularity).toBe(
      'year-month',
    )
  })

  it('setCalendarModeで和暦表示モードへ切り替えられ、他の設定は変化しない', () => {
    useDisplaySettingsStore.getState().setBirthDateGranularity('year')
    useDisplaySettingsStore.getState().setCalendarMode('wareki')

    expect(useDisplaySettingsStore.getState().calendarMode).toBe('wareki')
    expect(useDisplaySettingsStore.getState().birthDateGranularity).toBe('year')
  })

  it('setVisibleCardFieldは指定した項目のみを切り替え、他の項目には影響しない', () => {
    const before = useDisplaySettingsStore.getState().visibleCardFields

    useDisplaySettingsStore.getState().setVisibleCardField('surname', false)

    expect(useDisplaySettingsStore.getState().visibleCardFields).toEqual({
      ...before,
      surname: false,
    })
  })

  it('setVisibleCardFieldの変更は再読み込み相当(localStorageからの再読込)後も維持される', () => {
    useDisplaySettingsStore.getState().setVisibleCardField('furigana', true)
    expect(loadDisplaySettings().visibleCardFields.furigana).toBe(true)
  })

  it('setShowMarriageDateOnLinkで婚姻線ラベルの表示を切り替えられ、再読み込み後も維持される', () => {
    expect(useDisplaySettingsStore.getState().showMarriageDateOnLink).toBe(
      false,
    )

    useDisplaySettingsStore.getState().setShowMarriageDateOnLink(true)

    expect(useDisplaySettingsStore.getState().showMarriageDateOnLink).toBe(true)
    expect(loadDisplaySettings().showMarriageDateOnLink).toBe(true)
  })
})

describe('useDisplaySettingsStore: localStorageアクセスがブロックされた環境', () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(
    window,
    'localStorage',
  )

  afterEach(() => {
    if (originalDescriptor) {
      Object.defineProperty(window, 'localStorage', originalDescriptor)
    }
    vi.resetModules()
  })

  it('localStorageアクセサがSecurityErrorをthrowしてもデフォルト設定で起動する', async () => {
    // Chromeの「サイトデータをブロック」相当: アクセサ自体がthrowする
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException(
          'Access is denied for this document.',
          'SecurityError',
        )
      },
    })

    // モジュール評価時(create時)にthrowで死なないことを、新規importで検証する
    vi.resetModules()
    const { useDisplaySettingsStore: freshStore } =
      await import('./display-settings-store')
    const state = freshStore.getState()
    expect(state.birthDateGranularity).toBe(
      DEFAULT_DISPLAY_SETTINGS.birthDateGranularity,
    )
    expect(state.deathDateGranularity).toBe(
      DEFAULT_DISPLAY_SETTINGS.deathDateGranularity,
    )
    expect(state.calendarMode).toBe(DEFAULT_DISPLAY_SETTINGS.calendarMode)
    expect(state.visibleCardFields).toEqual(
      DEFAULT_DISPLAY_SETTINGS.visibleCardFields,
    )
    expect(state.showMarriageDateOnLink).toBe(
      DEFAULT_DISPLAY_SETTINGS.showMarriageDateOnLink,
    )

    // 設定変更(保存はsaveDisplaySettings内のtry/catchで握りつぶされる)もthrowしない
    expect(() => freshStore.getState().setCalendarMode('wareki')).not.toThrow()
    expect(freshStore.getState().calendarMode).toBe('wareki')
  })
})

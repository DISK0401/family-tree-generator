import { create } from 'zustand'
import {
  DEFAULT_DISPLAY_SETTINGS,
  loadDisplaySettings,
  saveDisplaySettings,
  type CalendarMode,
  type CardFieldVisibility,
  type DateGranularity,
  type DisplaySettings,
} from './display-settings'

/**
 * 表示設定(design.md D9)のReact向け状態管理。
 * tree-storeとは独立しており、undo/redo履歴の対象にしない。変更のたびにlocalStorageへ保存する。
 */
export interface DisplaySettingsStoreState extends DisplaySettings {
  setBirthDateGranularity: (granularity: DateGranularity) => void
  setDeathDateGranularity: (granularity: DateGranularity) => void
  setCalendarMode: (mode: CalendarMode) => void
  /** カード表示項目を1件だけオン/オフする(design.md D8) */
  setVisibleCardField: (field: keyof CardFieldVisibility, value: boolean) => void
  setShowMarriageDateOnLink: (value: boolean) => void
}

function currentSettings(state: DisplaySettingsStoreState): DisplaySettings {
  return {
    birthDateGranularity: state.birthDateGranularity,
    deathDateGranularity: state.deathDateGranularity,
    calendarMode: state.calendarMode,
    visibleCardFields: state.visibleCardFields,
    showMarriageDateOnLink: state.showMarriageDateOnLink,
  }
}

export const useDisplaySettingsStore = create<DisplaySettingsStoreState>((set, get) => ({
  ...(typeof localStorage === 'undefined' ? DEFAULT_DISPLAY_SETTINGS : loadDisplaySettings()),

  setBirthDateGranularity: (birthDateGranularity) => {
    set({ birthDateGranularity })
    saveDisplaySettings({ ...currentSettings(get()), birthDateGranularity })
  },

  setDeathDateGranularity: (deathDateGranularity) => {
    set({ deathDateGranularity })
    saveDisplaySettings({ ...currentSettings(get()), deathDateGranularity })
  },

  setCalendarMode: (calendarMode) => {
    set({ calendarMode })
    saveDisplaySettings({ ...currentSettings(get()), calendarMode })
  },

  setVisibleCardField: (field, value) => {
    const visibleCardFields = { ...get().visibleCardFields, [field]: value }
    set({ visibleCardFields })
    saveDisplaySettings({ ...currentSettings(get()), visibleCardFields })
  },

  setShowMarriageDateOnLink: (showMarriageDateOnLink) => {
    set({ showMarriageDateOnLink })
    saveDisplaySettings({ ...currentSettings(get()), showMarriageDateOnLink })
  },
}))

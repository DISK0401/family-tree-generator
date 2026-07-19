import { create } from 'zustand'
import {
  DEFAULT_DISPLAY_SETTINGS,
  loadDisplaySettings,
  saveDisplaySettings,
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
}

export const useDisplaySettingsStore = create<DisplaySettingsStoreState>((set, get) => ({
  ...(typeof localStorage === 'undefined' ? DEFAULT_DISPLAY_SETTINGS : loadDisplaySettings()),

  setBirthDateGranularity: (birthDateGranularity) => {
    set({ birthDateGranularity })
    saveDisplaySettings({ birthDateGranularity, deathDateGranularity: get().deathDateGranularity })
  },

  setDeathDateGranularity: (deathDateGranularity) => {
    set({ deathDateGranularity })
    saveDisplaySettings({ birthDateGranularity: get().birthDateGranularity, deathDateGranularity })
  },
}))

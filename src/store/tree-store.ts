import { create } from 'zustand'
import { createTreeDocument } from '../domain/helpers'
import type { TreeDocument } from '../domain/types'

/**
 * 家系図の状態管理。
 * ドメインコマンドは純関数(src/domain/commands.ts)として実装済みで、
 * このストアは「コマンドの戻り値を適用し、スナップショットでundo/redo履歴を積む」だけの薄い層とする。
 * 家系図は高々数百人物と小さいため、パッチ方式ではなく structuredClone によるスナップショットで十分(design.md D4)。
 */

const HISTORY_LIMIT = 100

export interface TreeStoreState {
  document: TreeDocument
  past: TreeDocument[]
  future: TreeDocument[]
  /** コマンド適用: 現在のdocumentを引数に取り、新しいdocumentを返す関数を渡す */
  apply: (fn: (doc: TreeDocument) => TreeDocument) => void
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
  /** 履歴を残さずdocumentを丸ごと差し替える(IndexedDBからの復元・全削除用) */
  replace: (doc: TreeDocument) => void
}

export const useTreeStore = create<TreeStoreState>((set, get) => ({
  document: createTreeDocument(),
  past: [],
  future: [],

  apply: (fn) => {
    const { document, past } = get()
    const snapshot = structuredClone(document)
    const next = fn(document)
    const nextPast = [...past, snapshot].slice(-HISTORY_LIMIT)
    set({ document: next, past: nextPast, future: [] })
  },

  undo: () => {
    const { document, past, future } = get()
    if (past.length === 0) return
    const previous = past[past.length - 1]
    set({
      document: previous,
      past: past.slice(0, -1),
      future: [structuredClone(document), ...future].slice(0, HISTORY_LIMIT),
    })
  },

  redo: () => {
    const { document, past, future } = get()
    if (future.length === 0) return
    const next = future[0]
    set({
      document: next,
      past: [...past, structuredClone(document)].slice(-HISTORY_LIMIT),
      future: future.slice(1),
    })
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  replace: (doc) => set({ document: doc, past: [], future: [] }),
}))

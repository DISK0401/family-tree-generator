import { create } from 'zustand'
import { createTreeDocument } from '../domain/helpers'
import type { TreeDocument } from '../domain/types'

/**
 * 家系図の状態管理。
 * ドメインコマンドは純関数(src/domain/commands.ts)として実装済みで、
 * このストアは「コマンドの戻り値を適用し、スナップショットでundo/redo履歴を積む」だけの薄い層とする。
 * 家系図は高々数百人物と小さいため、パッチ方式ではなく参照のスナップショットで十分(design.md D4)。
 *
 * スナップショットにstructuredCloneは使わない。コマンドはスプレッドによる不変更新のみを
 * 行い過去のdocumentを後から書き換えないため、旧参照をそのまま履歴へ積めば正しい
 * スナップショットになる。むしろクローンすると不変更新が保っていた共有構造が破壊され、
 * メモリを浪費するうえ、参照同一性に基づく比較(Reactのメモ化等)も効かなくなる。
 *
 * undoで巻き戻すと`document.updatedAt`も操作前の値へ戻る。これは「updatedAt =
 * その内容になった時刻」であり、undo自体の時刻ではないという仕様(スナップショット復元の帰結)。
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
    const next = fn(document)
    // 同一参照が返るのはコマンドが何もしなかった合図(例: linkParentの「既にその家族の子」)。
    // 履歴に積むと「何も起きないundo」が挟まり、future(redo履歴)まで消えてしまうため、
    // no-opでは状態を一切変えない
    if (next === document) return
    const nextPast = [...past, document].slice(-HISTORY_LIMIT)
    set({ document: next, past: nextPast, future: [] })
  },

  undo: () => {
    const { document, past, future } = get()
    if (past.length === 0) return
    const previous = past[past.length - 1]
    set({
      document: previous,
      past: past.slice(0, -1),
      future: [document, ...future].slice(0, HISTORY_LIMIT),
    })
  },

  redo: () => {
    const { document, past, future } = get()
    if (future.length === 0) return
    const next = future[0]
    set({
      document: next,
      past: [...past, document].slice(-HISTORY_LIMIT),
      future: future.slice(1),
    })
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  replace: (doc) => set({ document: doc, past: [], future: [] }),
}))

import { useCallback, useEffect, useRef, useState } from 'react'
import { createTreeDocument } from '../domain/helpers'
import { useTreeStore } from '../store/tree-store'
import { clearTreeDocument, loadTreeDocument, saveTreeDocument } from './db'
import { requestPersistentStorage } from './persist-storage'

/** デバウンス時間。design.md D5「500ms〜1sのデバウンス」、spec local-autosave「最大1秒」に準拠 */
const AUTOSAVE_DEBOUNCE_MS = 800

export type PersistenceStatus =
  | { phase: 'loading' }
  | { phase: 'blocked'; storedVersion: number; currentVersion: number }
  | { phase: 'ready'; saveState: 'idle' | 'saving' | 'saved' }

export interface PersistedTree {
  status: PersistenceStatus
  /**
   * 端末内の家系図データを完全に削除し、空状態から再開できるようにする。
   * blocked状態(schemaVersionガードで自動保存が無効化されている場合)から呼んでも
   * 自動保存が正しく再開されるよう、内部ガードの解除もあわせて行う。
   */
  resetAllData: () => Promise<void>
}

/**
 * 画面ロード時にIndexedDBからTreeDocumentを復元し、以後の編集をデバウンス自動保存する。
 * schemaVersionが現行より新しいデータが見つかった場合(too-new)は、
 * 読み取り・上書きを一切行わず blocked を返す(呼び出し側は編集UIをブロックし警告を表示すること)。
 */
export function usePersistedTree(): PersistedTree {
  const document = useTreeStore((s) => s.document)
  const replace = useTreeStore((s) => s.replace)
  const [status, setStatus] = useState<PersistenceStatus>({ phase: 'loading' })
  // `ready` はreactive stateにする(refだと、初期ロード完了前に発生した編集の保存が
  // 「documentのeffect依存が変化しないため二度と発火しない」まま取りこぼされてしまう)
  const [ready, setReady] = useState(false)
  const blockedRef = useRef(false)
  const hasRequestedPersistRef = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  // 最後に保存(スケジュール)したdocumentの参照。ready遷移だけでは再スケジュールしないための基準
  const lastHandledDocumentRef = useRef(document)

  useEffect(() => {
    let cancelled = false
    loadTreeDocument().then((result) => {
      if (cancelled) return
      if (result.status === 'too-new') {
        blockedRef.current = true
        setStatus({
          phase: 'blocked',
          storedVersion: result.storedVersion,
          currentVersion: result.currentVersion,
        })
        return
      }
      if (result.status === 'ok' || result.status === 'migrated') {
        replace(result.document)
      }
      blockedRef.current = false
      setReady(true)
      setStatus({ phase: 'ready', saveState: 'idle' })
    })
    return () => {
      cancelled = true
    }
  }, [replace])

  useEffect(() => {
    if (blockedRef.current || !ready) return
    // readyへの遷移時、documentが未処理のもの(mount時または直前のスケジュール以降変化なし)なら
    // 何もせずidleのまま留める。過去に保存対象になったことのある変化のみを拾う
    if (document === lastHandledDocumentRef.current) return
    lastHandledDocumentRef.current = document
    setStatus({ phase: 'ready', saveState: 'saving' })
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      void saveTreeDocument(document).then(() => {
        if (!hasRequestedPersistRef.current) {
          hasRequestedPersistRef.current = true
          void requestPersistentStorage()
        }
        setStatus({ phase: 'ready', saveState: 'saved' })
      })
    }, AUTOSAVE_DEBOUNCE_MS)
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [document, ready])

  const resetAllData = useCallback(async () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    await clearTreeDocument()
    blockedRef.current = false
    replace(createTreeDocument())
    setReady(true)
    setStatus({ phase: 'ready', saveState: 'idle' })
  }, [replace])

  return { status, resetAllData }
}

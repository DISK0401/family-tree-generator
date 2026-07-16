import { useEffect, useRef, useState } from 'react'
import { useTreeStore } from '../store/tree-store'
import { loadTreeDocument, saveTreeDocument } from './db'
import { requestPersistentStorage } from './persist-storage'

/** デバウンス時間。design.md D5「500ms〜1sのデバウンス」、spec local-autosave「最大1秒」に準拠 */
const AUTOSAVE_DEBOUNCE_MS = 800

export type PersistenceStatus =
  | { phase: 'loading' }
  | { phase: 'blocked'; storedVersion: number; currentVersion: number }
  | { phase: 'ready'; saveState: 'idle' | 'saving' | 'saved' }

/**
 * 画面ロード時にIndexedDBからTreeDocumentを復元し、以後の編集をデバウンス自動保存する。
 * schemaVersionが現行より新しいデータが見つかった場合(too-new)は、
 * 読み取り・上書きを一切行わず blocked を返す(呼び出し側は編集UIをブロックし警告を表示すること)。
 */
export function usePersistedTree(): PersistenceStatus {
  const document = useTreeStore((s) => s.document)
  const replace = useTreeStore((s) => s.replace)
  const [status, setStatus] = useState<PersistenceStatus>({ phase: 'loading' })
  const blockedRef = useRef(false)
  const initializedRef = useRef(false)
  const hasRequestedPersistRef = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

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
      initializedRef.current = true
      setStatus({ phase: 'ready', saveState: 'idle' })
    })
    return () => {
      cancelled = true
    }
  }, [replace])

  useEffect(() => {
    if (blockedRef.current || !initializedRef.current) return
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
  }, [document])

  return status
}

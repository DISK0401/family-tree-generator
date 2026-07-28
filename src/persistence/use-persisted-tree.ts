import { useCallback, useEffect, useRef, useState } from 'react'
import { createTreeDocument } from '../domain/helpers'
import type { TreeDocument } from '../domain/types'
import { useTreeStore } from '../store/tree-store'
import { clearTreeDocument, loadTreeDocument, saveTreeDocument } from './db'
import {
  isPersistentStorageSupported,
  isStoragePersisted,
  requestPersistentStorage,
} from './persist-storage'

/** デバウンス時間。design.md D5「500ms〜1sのデバウンス」、spec local-autosave「最大1秒」に準拠 */
export const AUTOSAVE_DEBOUNCE_MS = 800

/**
 * タブ間でドキュメントの書き込みを通知するチャネル名。
 * 受信したタブは stale(自身の状態が古い)として編集・保存を停止し、相互上書きを防ぐ。
 */
export const DOCUMENT_CHANNEL_NAME = 'family-tree-generator:document'

export type PersistenceStatus =
  | { phase: 'loading' }
  | { phase: 'blocked'; storedVersion: number; currentVersion: number }
  | { phase: 'unavailable'; reason: 'load-failed' | 'corrupt' }
  | { phase: 'stale' } // 別タブが保存した後のこのタブ(編集・保存を停止)
  | { phase: 'ready'; saveState: 'idle' | 'saving' | 'saved' | 'error' }

export interface PersistedTree {
  status: PersistenceStatus
  /**
   * 端末内の家系図データを完全に削除し、空状態から再開できるようにする。
   * blocked / unavailable(corrupt等)/ stale から呼んでも自動保存が正しく再開されるよう、
   * 内部ガードの解除もあわせて行う。
   */
  resetAllData: () => Promise<void>
  /** saveState==='error' からの再試行(即時保存を再実行) */
  retrySave: () => void
  /** navigator.storage.persist() が拒否/未対応で、ブラウザ判断の退避があり得る場合 true */
  persistenceAtRisk: boolean
}

/**
 * 画面ロード時にIndexedDBからTreeDocumentを復元し、以後の編集をデバウンス自動保存する。
 * - schemaVersionが現行より新しい(too-new) → blocked(読み取り・上書きを一切しない)
 * - レコードが壊れている(corrupt)/ ロード自体の失敗 → unavailable(上書きを避けるため保存も停止)
 * - 別タブが保存した(BroadcastChannel受信) → stale(このタブの編集・保存を停止。回復はリロード前提)
 * 呼び出し側はstatusに応じて編集UIのブロック・警告表示を行うこと。
 */
export function usePersistedTree(): PersistedTree {
  const document = useTreeStore((s) => s.document)
  const replace = useTreeStore((s) => s.replace)
  const [status, setStatus] = useState<PersistenceStatus>({ phase: 'loading' })
  // `ready` はreactive stateにする(refだと、初期ロード完了前に発生した編集の保存が
  // 「documentのeffect依存が変化しないため二度と発火しない」まま取りこぼされてしまう)
  const [ready, setReady] = useState(false)
  const [persistenceAtRisk, setPersistenceAtRisk] = useState(false)
  /** 別タブの書き込みを受信済みか。trueの間このタブは一切書き込まない(上書き防止) */
  const staleRef = useRef(false)
  const hasRequestedPersistRef = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  // 最後に保存(スケジュール)したdocumentの参照。ready遷移だけでは再スケジュールしないための基準
  const lastHandledDocumentRef = useRef(document)
  /** デバウンス保留中またはsaving中(保存成功が未確認)のdocument。null = 未保存分なし */
  const pendingDocumentRef = useRef<TreeDocument | null>(null)
  /** 保存試行ごとに増える単調トークン。古い試行の完了が新しい状態を上書きしないためのガード */
  const saveTokenRef = useRef(0)
  const channelRef = useRef<BroadcastChannel | null>(null)

  const clearSaveTimer = useCallback(() => {
    if (saveTimerRef.current !== undefined) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = undefined
    }
  }, [])

  /** 別タブの書き込み通知を受けた後の停止処理。回復はページ再読み込み前提(リロード導線はUI側) */
  const markStale = useCallback(() => {
    staleRef.current = true
    pendingDocumentRef.current = null
    saveTokenRef.current += 1 // 進行中の保存完了ハンドラも無効化する
    clearSaveTimer()
    setReady(false)
    setStatus({ phase: 'stale' })
  }, [clearSaveTimer])

  const requestPersistOnce = useCallback(() => {
    if (hasRequestedPersistRef.current) return
    hasRequestedPersistRef.current = true
    void requestPersistentStorage().then((granted) => {
      // 拒否/未対応の場合、IndexedDBは容量逼迫時にブラウザ判断で退避され得ることをUIへ伝える
      setPersistenceAtRisk(!granted)
    })
  }, [])

  /**
   * documentを即時保存する。完了ハンドラは
   * - トークン(より新しい保存試行が始まっていないか)
   * - 保留document(保存中に新しい編集が来ていないか)
   * の両方で最新性を検証し、古い完了が「保存済み」を誤表示しないようにする。
   */
  const performSave = useCallback(
    (doc: TreeDocument) => {
      const token = (saveTokenRef.current += 1)
      saveTreeDocument(doc).then(
        () => {
          // stale化後に着地した書き込みのUI反映・再通知はしない(タブ間調停はベストエフォート)
          if (staleRef.current) return
          if (token !== saveTokenRef.current) return
          if (pendingDocumentRef.current !== doc) return // 新しい編集の保存予約に任せる
          pendingDocumentRef.current = null
          // 保存が落ち着いたタイミングで他タブへ通知する(受信側はstale化して上書きを防ぐ)
          channelRef.current?.postMessage({ type: 'saved' })
          requestPersistOnce()
          setStatus({ phase: 'ready', saveState: 'saved' })
        },
        (error: unknown) => {
          if (staleRef.current) return
          if (token !== saveTokenRef.current) return
          // QuotaExceededError(容量不足)はレポートで区別できるよう原因を残す。
          // TODO: 容量不足時のUI文言の出し分け(不要データの削除案内等)は将来課題
          const isQuotaExceeded =
            error instanceof DOMException && error.name === 'QuotaExceededError'
          console.error(
            isQuotaExceeded
              ? '自動保存に失敗しました(容量不足: QuotaExceededError)'
              : '自動保存に失敗しました',
            error,
          )
          if (pendingDocumentRef.current !== doc) return // 新しい保存予約が生きているため、その結果に任せる
          // pendingDocumentRefは保持したまま error にする(retrySaveの再試行対象)
          setStatus({ phase: 'ready', saveState: 'error' })
        },
      )
    },
    [requestPersistOnce],
  )

  /**
   * デバウンス待ちを飛ばして未保存分を即時保存する(タブ非表示・ページ離脱・アンマウント時)。
   * saving中(結果待ち)に呼ばれた場合は同じdocumentをもう一度putするだけで、害はない。
   */
  const flushPendingSave = useCallback(() => {
    if (staleRef.current) return
    const doc = pendingDocumentRef.current
    if (!doc) return
    clearSaveTimer()
    performSave(doc)
  }, [clearSaveTimer, performSave])

  /** saveState==='error' からの再試行。保留中のdocumentを即時保存し直す */
  const retrySave = useCallback(() => {
    if (staleRef.current) return
    const doc = pendingDocumentRef.current
    if (!doc) return
    clearSaveTimer()
    setStatus({ phase: 'ready', saveState: 'saving' })
    performSave(doc)
  }, [clearSaveTimer, performSave])

  // 初期ロード。失敗時は上書きを避けるため自動保存を開始しない(unavailable)
  useEffect(() => {
    let cancelled = false
    loadTreeDocument().then(
      (result) => {
        if (cancelled) return
        // ロード中に別タブの書き込み通知を受けた場合はstaleを維持する
        if (staleRef.current) return
        if (result.status === 'too-new') {
          setStatus({
            phase: 'blocked',
            storedVersion: result.storedVersion,
            currentVersion: result.currentVersion,
          })
          return
        }
        if (result.status === 'corrupt') {
          // 破損レコードは削除せず残し(手動レスキューの余地)、自動保存も止めて上書きを防ぐ。
          // ユーザーが明示的にresetAllData(全削除)した場合のみ消える
          setStatus({ phase: 'unavailable', reason: 'corrupt' })
          return
        }
        if (result.status === 'ok' || result.status === 'migrated') {
          replace(result.document)
          // 復元したdocumentは「処理済み」として扱い、ロード直後の冗長な自動保存を防ぐ
          lastHandledDocumentRef.current = result.document
        }
        setReady(true)
        setStatus({ phase: 'ready', saveState: 'idle' })
        if (result.status === 'migrated') {
          // マイグレーション結果は暗黙の副作用に頼らず、ここで明示的に1回だけ保存する
          pendingDocumentRef.current = result.document
          performSave(result.document)
        }
      },
      (error: unknown) => {
        if (cancelled) return
        console.error('保存データの読み込みに失敗しました', error)
        setStatus({ phase: 'unavailable', reason: 'load-failed' })
      },
    )
    return () => {
      cancelled = true
    }
  }, [replace, performSave])

  // 永続ストレージの現状確認。すでに許可済みなら以後のpersist()要求は不要
  useEffect(() => {
    let cancelled = false
    void isStoragePersisted().then((persisted) => {
      if (cancelled) return
      if (!isPersistentStorageSupported()) {
        // Storage API自体が無いブラウザでは、容量逼迫時にブラウザ判断で削除され得る
        setPersistenceAtRisk(true)
        return
      }
      if (!persisted) return
      hasRequestedPersistRef.current = true
      setPersistenceAtRisk(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // タブ間の書き込み通知。BroadcastChannel未対応環境(古いブラウザ等)では
  // 従来どおりの動作となる(マルチタブ検知はベストエフォートの安全装置という位置づけ)
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel(DOCUMENT_CHANNEL_NAME)
    channelRef.current = channel
    // 受信内容(saved / reset)によらず「他タブが書き込んだ」事実だけでこのタブをstale化する
    channel.onmessage = () => markStale()
    return () => {
      channelRef.current = null
      channel.close()
    }
  }, [markStale])

  // 編集のデバウンス自動保存
  useEffect(() => {
    if (!ready) return
    // readyへの遷移時、documentが未処理のもの(mount時または直前のスケジュール以降変化なし)なら
    // 何もせずidleのまま留める。過去に保存対象になったことのある変化のみを拾う
    if (document === lastHandledDocumentRef.current) return
    lastHandledDocumentRef.current = document
    pendingDocumentRef.current = document
    setStatus({ phase: 'ready', saveState: 'saving' })
    clearSaveTimer()
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = undefined
      if (pendingDocumentRef.current) performSave(pendingDocumentRef.current)
    }, AUTOSAVE_DEBOUNCE_MS)
    // クリーンアップはタイマー破棄のみ。未保存分の退避は下のflushPendingSave(離脱・アンマウント)が担う
    return () => clearSaveTimer()
  }, [document, ready, clearSaveTimer, performSave])

  // 離脱時のフラッシュ: デバウンス待ちの編集を、タブ非表示・ページ離脱の瞬間に即時保存する。
  // 未保存分が残っている間のbeforeunloadでは離脱確認を出す
  useEffect(() => {
    // このフック内の`document`はTreeDocumentのため、DOMのdocumentはwindow経由で明示参照する
    const onVisibilityChange = () => {
      if (window.document.visibilityState === 'hidden') flushPendingSave()
    }
    const onPageHide = () => flushPendingSave()
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (staleRef.current || !pendingDocumentRef.current) return
      // 未保存分(デバウンス待ちまたはsaving中)があるうちは離脱確認を出す
      event.preventDefault()
      // 一部ブラウザ(旧Chrome等)はreturnValueの設定を要求する
      event.returnValue = ''
    }
    window.document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.document.removeEventListener(
        'visibilitychange',
        onVisibilityChange,
      )
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('beforeunload', onBeforeUnload)
      // アンマウント時(クリーンアップ)にも保留分があれば即時保存し、タイマー破棄だけで取りこぼさない
      flushPendingSave()
    }
  }, [flushPendingSave])

  const resetAllData = useCallback(async () => {
    clearSaveTimer()
    // 進行中の保存完了ハンドラを無効化してから全消去する
    saveTokenRef.current += 1
    pendingDocumentRef.current = null
    await clearTreeDocument()
    // 他タブは削除前のデータを保持している可能性があるため、stale化を通知して再保存を防ぐ
    channelRef.current?.postMessage({ type: 'reset' })
    staleRef.current = false
    replace(createTreeDocument())
    setReady(true)
    setStatus({ phase: 'ready', saveState: 'idle' })
    // NOTE: この直後、replaceによるdocument変化を自動保存effectが拾い、新しい空ドキュメントが
    // 1件保存される。つまり「すべて削除」後のIndexedDBは「レコードなし」ではなく
    // 「新しいidを持つ空の家系図1件」に落ち着く。ユーザーへの約束(人物・家族データの完全削除)は
    // 満たしつつ自動保存を通常運転へ戻すための意図した挙動であり、変更しないこと
  }, [replace, clearSaveTimer])

  return { status, resetAllData, retrySave, persistenceAtRisk }
}

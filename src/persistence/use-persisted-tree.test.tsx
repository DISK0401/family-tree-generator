import 'fake-indexeddb/auto'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addPerson } from '../domain/commands'
import { createTreeDocument } from '../domain/helpers'
import { useTreeStore } from '../store/tree-store'
import { clearTreeDocument, loadTreeDocument, saveTreeDocument } from './db'
import {
  AUTOSAVE_DEBOUNCE_MS,
  DOCUMENT_CHANNEL_NAME,
  usePersistedTree,
  type PersistedTree,
} from './use-persisted-tree'

/*
 * db層は実装(fake-indexeddb)をそのまま生かしたspyにする。
 * 失敗注入(mockRejectedValueOnce等)をしたテストの後はafterEachのrestoreAllMocksで実装へ戻る。
 */
vi.mock('./db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./db')>()
  return {
    ...actual,
    saveTreeDocument: vi.fn(actual.saveTreeDocument),
    loadTreeDocument: vi.fn(actual.loadTreeDocument),
    clearTreeDocument: vi.fn(actual.clearTreeDocument),
  }
})

/**
 * BroadcastChannelのモック。jsdomには実装がないため、テストごとにstubGlobalで注入する。
 * 実物と同様、postMessageは送信元自身には配信しない。
 */
class MockBroadcastChannel {
  static instances: MockBroadcastChannel[] = []
  readonly name: string
  onmessage: ((event: MessageEvent) => void) | null = null
  private closed = false
  constructor(name: string) {
    this.name = name
    MockBroadcastChannel.instances.push(this)
  }
  postMessage(data: unknown): void {
    for (const channel of MockBroadcastChannel.instances) {
      if (channel === this || channel.closed || channel.name !== this.name)
        continue
      channel.onmessage?.({ data } as MessageEvent)
    }
  }
  close(): void {
    this.closed = true
  }
}

/*
 * fake-indexeddbはjsdomサンドボックスの外(Node実行環境)のsetImmediateへ逃げるため、
 * vitestのfake timersでは進められないことがある。フラッシュ用に実タイマーを退避しておく。
 */
const realSetTimeout = globalThis.setTimeout.bind(globalThis)

const originalStorageDescriptor = Object.getOwnPropertyDescriptor(
  navigator,
  'storage',
)

function defineNavigatorStorage(value: unknown) {
  Object.defineProperty(navigator, 'storage', { configurable: true, value })
}

/** document.visibilityStateを'hidden'へ偽装する(afterEachで復元) */
function setDocumentHidden() {
  Object.defineProperty(window.document, 'visibilityState', {
    configurable: true,
    get: () => 'hidden',
  })
}

beforeEach(async () => {
  // ここは実タイマーのまま実行される(fake timersは各テスト内で有効化する)
  await clearTreeDocument()
  // vi.restoreAllMocksはvi.spyOn由来のspyしか対象にしないため、
  // モジュールモックのvi.fnは呼び出し履歴を明示的にクリアする(実装・Once注入はテスト内で消費済み)
  vi.mocked(clearTreeDocument).mockClear()
  vi.mocked(loadTreeDocument).mockClear()
  vi.mocked(saveTreeDocument).mockClear()
  useTreeStore.getState().replace(createTreeDocument())
  MockBroadcastChannel.instances = []
  vi.stubGlobal('BroadcastChannel', MockBroadcastChannel)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  // navigator.storageのdefinePropertyを必ず復元する(テスト間の順序依存を防ぐ)
  if (originalStorageDescriptor) {
    Object.defineProperty(navigator, 'storage', originalStorageDescriptor)
  } else {
    delete (navigator as unknown as Record<string, unknown>).storage
  }
  Reflect.deleteProperty(window.document, 'visibilityState')
})

/**
 * fake-indexeddbの非同期処理を、デバウンスタイマー(800ms)を進めずに完了させる。
 * fake化されたスケジューラと実スケジューラのどちらで動いていても進むよう、
 * 微小なfake時間の前進と実イベントループの解放を交互に繰り返す。
 */
async function flushAsyncWork() {
  for (let i = 0; i < 25; i++) {
    await vi.advanceTimersByTimeAsync(1)
    await new Promise((resolve) => realSetTimeout(resolve, 0))
  }
}

async function flushAsync() {
  await act(async () => {
    await flushAsyncWork()
  })
}

/** デバウンスを経過させ、その結果のIndexedDB書き込み完了まで進める */
async function advancePastDebounce() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS)
    await flushAsyncWork()
  })
}

/** fake timersを有効化してフックを描画し、初期ロード完了(ready idle)まで進める */
async function renderReadyHook() {
  vi.useFakeTimers()
  const utils = renderHook(() => usePersistedTree())
  await flushAsync()
  expect(utils.result.current.status).toEqual({
    phase: 'ready',
    saveState: 'idle',
  })
  return utils
}

/** resetAllData(内部でIndexedDB削除を待つ)をfake timers下で完了させる */
async function resetData(result: { current: PersistedTree }) {
  await act(async () => {
    const promise = result.current.resetAllData()
    await flushAsyncWork()
    await promise
  })
}

function editStore(given: string) {
  act(() => {
    useTreeStore.getState().apply((d) => addPerson(d, { name: { given } }).doc)
  })
}

describe('usePersistedTree: 復元', () => {
  it('保存データなしの場合はready(idle)になり、ストアはそのまま(空状態)', async () => {
    const { result } = await renderReadyHook()
    expect(result.current.status).toEqual({ phase: 'ready', saveState: 'idle' })
    expect(Object.keys(useTreeStore.getState().document.persons)).toHaveLength(
      0,
    )
  })

  it('保存済みデータがあれば復元される', async () => {
    const doc = createTreeDocument({ title: '既存の家系図' })
    const { doc: withPerson } = addPerson(doc, { name: { given: '太郎' } })
    await saveTreeDocument(withPerson)

    await renderReadyHook()
    expect(useTreeStore.getState().document.title).toBe('既存の家系図')
    expect(
      Object.values(useTreeStore.getState().document.persons),
    ).toHaveLength(1)
  })

  it('okロードの直後に冗長な自動保存は走らない', async () => {
    const doc = createTreeDocument({ title: '既存の家系図' })
    await saveTreeDocument(doc)
    vi.mocked(saveTreeDocument).mockClear()

    const { result } = await renderReadyHook()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS * 5)
    })
    expect(vi.mocked(saveTreeDocument)).not.toHaveBeenCalled()
    expect(result.current.status).toEqual({ phase: 'ready', saveState: 'idle' })
  })

  it('migratedロードでは移行結果が明示的に1回だけ保存される', async () => {
    const migratedDoc = createTreeDocument({ title: '移行済みの家系図' })
    vi.mocked(loadTreeDocument).mockResolvedValueOnce({
      status: 'migrated',
      document: migratedDoc,
      fromVersion: 0,
    })

    vi.useFakeTimers()
    const { result } = renderHook(() => usePersistedTree())
    await flushAsync()

    expect(useTreeStore.getState().document.title).toBe('移行済みの家系図')
    expect(vi.mocked(saveTreeDocument)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(saveTreeDocument)).toHaveBeenCalledWith(migratedDoc)
    expect(result.current.status).toEqual({
      phase: 'ready',
      saveState: 'saved',
    })

    // その後の冗長保存も走らない
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS * 5)
    })
    expect(vi.mocked(saveTreeDocument)).toHaveBeenCalledTimes(1)
  })

  it('ロード自体が失敗した場合はunavailable(load-failed)になり、自動保存は開始されない', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})
    vi.mocked(loadTreeDocument).mockRejectedValueOnce(new Error('open failed'))

    vi.useFakeTimers()
    const { result } = renderHook(() => usePersistedTree())
    await flushAsync()
    expect(result.current.status).toEqual({
      phase: 'unavailable',
      reason: 'load-failed',
    })
    expect(consoleErrorSpy).toHaveBeenCalled()

    // 上書き防止: 編集しても保存されない
    editStore('花子')
    await advancePastDebounce()
    expect(vi.mocked(saveTreeDocument)).not.toHaveBeenCalled()
  })
})

describe('usePersistedTree: 破損データ', () => {
  it('corruptロードはunavailable(corrupt)になり、上書き保存されない', async () => {
    vi.mocked(loadTreeDocument).mockResolvedValueOnce({ status: 'corrupt' })

    vi.useFakeTimers()
    const { result } = renderHook(() => usePersistedTree())
    await flushAsync()
    expect(result.current.status).toEqual({
      phase: 'unavailable',
      reason: 'corrupt',
    })

    editStore('花子')
    await advancePastDebounce()
    expect(vi.mocked(saveTreeDocument)).not.toHaveBeenCalled()
  })

  it('corrupt状態からresetAllDataで全消去し、自動保存を再開できる', async () => {
    vi.mocked(loadTreeDocument).mockResolvedValueOnce({ status: 'corrupt' })

    vi.useFakeTimers()
    const { result } = renderHook(() => usePersistedTree())
    await flushAsync()
    expect(result.current.status).toEqual({
      phase: 'unavailable',
      reason: 'corrupt',
    })

    await resetData(result)
    await advancePastDebounce() // リセット後の空ドキュメント保存

    editStore('花子')
    expect(result.current.status).toEqual({
      phase: 'ready',
      saveState: 'saving',
    })
    await advancePastDebounce()
    expect(result.current.status).toEqual({
      phase: 'ready',
      saveState: 'saved',
    })

    vi.useRealTimers()
    const stored = await loadTreeDocument()
    expect(stored.status).toBe('ok')
    if (stored.status === 'ok') {
      expect(Object.values(stored.document.persons)).toHaveLength(1)
    }
  })
})

describe('usePersistedTree: 自動保存', () => {
  it('編集後デバウンスでsaving→savedと遷移し、IndexedDBへ書き込まれる', async () => {
    const { result } = await renderReadyHook()

    editStore('花子')
    expect(result.current.status).toEqual({
      phase: 'ready',
      saveState: 'saving',
    })

    await advancePastDebounce()
    expect(result.current.status).toEqual({
      phase: 'ready',
      saveState: 'saved',
    })

    vi.useRealTimers()
    const stored = await loadTreeDocument()
    expect(stored.status).toBe('ok')
    if (stored.status === 'ok') {
      expect(Object.values(stored.document.persons)).toHaveLength(1)
    }
  })

  it('保存中に新しい編集が来た場合、古い保存の完了ではsavedにならない(誤表示レース)', async () => {
    let resolveFirstSave: (() => void) | undefined
    vi.mocked(saveTreeDocument).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveFirstSave = resolve
        }),
    )
    const { result } = await renderReadyHook()

    editStore('花子')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS)
    })
    // 1回目の保存が進行中(未解決)
    expect(vi.mocked(saveTreeDocument)).toHaveBeenCalledTimes(1)
    expect(result.current.status).toEqual({
      phase: 'ready',
      saveState: 'saving',
    })

    // 保存中に2人目を追加
    editStore('二郎')
    expect(result.current.status).toEqual({
      phase: 'ready',
      saveState: 'saving',
    })

    // 古い保存が今ごろ完了しても、savedにはならない
    await act(async () => {
      resolveFirstSave?.()
      await Promise.resolve()
    })
    expect(result.current.status).toEqual({
      phase: 'ready',
      saveState: 'saving',
    })

    // 新しい編集の保存が完了して初めてsavedになる
    await advancePastDebounce()
    expect(result.current.status).toEqual({
      phase: 'ready',
      saveState: 'saved',
    })

    vi.useRealTimers()
    const stored = await loadTreeDocument()
    expect(stored.status).toBe('ok')
    if (stored.status === 'ok') {
      expect(Object.values(stored.document.persons)).toHaveLength(2)
    }
  })
})

describe('usePersistedTree: 保存失敗の可視化', () => {
  it('保存失敗でerrorへ遷移し、retrySaveの成功でsavedになる', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})
    const { result } = await renderReadyHook()

    vi.mocked(saveTreeDocument).mockRejectedValueOnce(new Error('put failed'))
    editStore('花子')
    await advancePastDebounce()
    expect(result.current.status).toEqual({
      phase: 'ready',
      saveState: 'error',
    })
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '自動保存に失敗しました',
      expect.any(Error),
    )

    // 再試行(mockRejectedValueOnceは消費済みのため実IndexedDBへ書き込まれる)
    await act(async () => {
      result.current.retrySave()
      await flushAsyncWork()
    })
    expect(result.current.status).toEqual({
      phase: 'ready',
      saveState: 'saved',
    })

    vi.useRealTimers()
    const stored = await loadTreeDocument()
    expect(stored.status).toBe('ok')
    if (stored.status === 'ok') {
      expect(Object.values(stored.document.persons)).toHaveLength(1)
    }
  })

  it('QuotaExceededErrorはconsole.errorで容量不足と区別される', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})
    const { result } = await renderReadyHook()

    vi.mocked(saveTreeDocument).mockRejectedValueOnce(
      new DOMException('quota exceeded', 'QuotaExceededError'),
    )
    editStore('花子')
    await advancePastDebounce()
    expect(result.current.status).toEqual({
      phase: 'ready',
      saveState: 'error',
    })
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('QuotaExceededError'),
      expect.anything(),
    )
  })
})

describe('usePersistedTree: アンロード時のフラッシュ', () => {
  it('タブ非表示(visibilitychange)でデバウンスを待たず即時保存される', async () => {
    const { result } = await renderReadyHook()

    editStore('花子')
    expect(result.current.status).toEqual({
      phase: 'ready',
      saveState: 'saving',
    })
    expect(vi.mocked(saveTreeDocument)).not.toHaveBeenCalled()

    setDocumentHidden()
    act(() => {
      window.document.dispatchEvent(new Event('visibilitychange'))
    })
    // タイマー経過前に即時発行される
    expect(vi.mocked(saveTreeDocument)).toHaveBeenCalledTimes(1)

    await flushAsync()
    expect(result.current.status).toEqual({
      phase: 'ready',
      saveState: 'saved',
    })

    // タイマーはクリア済みのため、デバウンス経過後に重複保存されない
    await advancePastDebounce()
    expect(vi.mocked(saveTreeDocument)).toHaveBeenCalledTimes(1)
  })

  it('pagehideでも即時保存される', async () => {
    await renderReadyHook()

    editStore('花子')
    expect(vi.mocked(saveTreeDocument)).not.toHaveBeenCalled()
    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })
    expect(vi.mocked(saveTreeDocument)).toHaveBeenCalledTimes(1)
  })

  it('未保存分がある間のbeforeunloadは離脱確認(preventDefault)し、保存完了後はしない', async () => {
    const { result } = await renderReadyHook()

    editStore('花子')
    const whileDirty = new Event('beforeunload', { cancelable: true })
    act(() => {
      window.dispatchEvent(whileDirty)
    })
    expect(whileDirty.defaultPrevented).toBe(true)

    await advancePastDebounce()
    expect(result.current.status).toEqual({
      phase: 'ready',
      saveState: 'saved',
    })

    const afterSaved = new Event('beforeunload', { cancelable: true })
    act(() => {
      window.dispatchEvent(afterSaved)
    })
    expect(afterSaved.defaultPrevented).toBe(false)
  })

  it('アンマウント時に保留分があれば即時保存される', async () => {
    const { unmount } = await renderReadyHook()

    editStore('花子')
    expect(vi.mocked(saveTreeDocument)).not.toHaveBeenCalled()

    unmount()
    expect(vi.mocked(saveTreeDocument)).toHaveBeenCalledTimes(1)

    // 書き込み完了まで進めて実データを確認
    await flushAsyncWork()
    vi.useRealTimers()
    const stored = await loadTreeDocument()
    expect(stored.status).toBe('ok')
    if (stored.status === 'ok') {
      expect(Object.values(stored.document.persons)).toHaveLength(1)
    }
  })
})

describe('usePersistedTree: マルチタブ', () => {
  it('別タブの保存通知を受信するとstaleになり、以後の自動保存・フラッシュが停止する', async () => {
    const { result } = await renderReadyHook()
    const otherTab = new MockBroadcastChannel(DOCUMENT_CHANNEL_NAME)

    // 未保存の編集がある状態で別タブが保存した
    editStore('花子')
    act(() => {
      otherTab.postMessage({ type: 'saved' })
    })
    expect(result.current.status).toEqual({ phase: 'stale' })

    // デバウンス経過後も保存されない(保留分は破棄され、上書きしない)
    await advancePastDebounce()
    expect(vi.mocked(saveTreeDocument)).not.toHaveBeenCalled()

    // 以後の編集も保存されない
    editStore('二郎')
    await advancePastDebounce()
    expect(vi.mocked(saveTreeDocument)).not.toHaveBeenCalled()
    expect(result.current.status).toEqual({ phase: 'stale' })

    // 非表示フラッシュも無効
    setDocumentHidden()
    act(() => {
      window.document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(vi.mocked(saveTreeDocument)).not.toHaveBeenCalled()
  })

  it('保存成功時に他タブへ通知される', async () => {
    const { result } = await renderReadyHook()
    const received: unknown[] = []
    const otherTab = new MockBroadcastChannel(DOCUMENT_CHANNEL_NAME)
    otherTab.onmessage = (event) => received.push(event.data)

    editStore('花子')
    await advancePastDebounce()
    expect(result.current.status).toEqual({
      phase: 'ready',
      saveState: 'saved',
    })
    expect(received).toEqual([{ type: 'saved' }])
  })

  it('resetAllDataは他タブへ通知し、受信した側はstaleになる', async () => {
    const { result } = await renderReadyHook()
    const received: unknown[] = []
    const otherTab = new MockBroadcastChannel(DOCUMENT_CHANNEL_NAME)
    otherTab.onmessage = (event) => received.push(event.data)

    await resetData(result)
    expect(received).toContainEqual({ type: 'reset' })

    // 受信側の挙動: reset通知でもstale化する
    const { result: receiver } = await renderReadyHook()
    act(() => {
      otherTab.postMessage({ type: 'reset' })
    })
    expect(receiver.current.status).toEqual({ phase: 'stale' })
  })

  it('BroadcastChannel未対応環境では従来どおり自動保存が動く', async () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    const { result } = await renderReadyHook()

    editStore('花子')
    await advancePastDebounce()
    expect(result.current.status).toEqual({
      phase: 'ready',
      saveState: 'saved',
    })
  })
})

describe('usePersistedTree: 永続ストレージ', () => {
  it('初回保存時にnavigator.storage.persist()が要求され、許可されればpersistenceAtRiskはfalse', async () => {
    const persist = vi.fn().mockResolvedValue(true)
    defineNavigatorStorage({ persist })

    const { result } = await renderReadyHook()
    expect(result.current.persistenceAtRisk).toBe(false)

    editStore('花子')
    await advancePastDebounce()
    expect(persist).toHaveBeenCalledTimes(1)
    expect(result.current.persistenceAtRisk).toBe(false)

    // 2回目の保存では再要求しない
    editStore('二郎')
    await advancePastDebounce()
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('persist()が拒否されるとpersistenceAtRiskがtrueになる', async () => {
    defineNavigatorStorage({ persist: vi.fn().mockResolvedValue(false) })

    const { result } = await renderReadyHook()
    editStore('花子')
    await advancePastDebounce()
    expect(result.current.persistenceAtRisk).toBe(true)
  })

  it('Storage API未対応ブラウザではマウント直後からpersistenceAtRiskがtrue', async () => {
    defineNavigatorStorage(undefined)
    const { result } = await renderReadyHook()
    expect(result.current.persistenceAtRisk).toBe(true)
  })

  it('すでにpersisted()がtrueならpersist()を再要求せず、persistenceAtRiskはfalse', async () => {
    const persist = vi.fn().mockResolvedValue(true)
    defineNavigatorStorage({
      persist,
      persisted: vi.fn().mockResolvedValue(true),
    })

    const { result } = await renderReadyHook()
    editStore('花子')
    await advancePastDebounce()
    expect(persist).not.toHaveBeenCalled()
    expect(result.current.persistenceAtRisk).toBe(false)
  })
})

describe('usePersistedTree: schemaVersionガード', () => {
  it('保存データが現行より新しい場合はblockedになり、上書きされない', async () => {
    const future = { ...createTreeDocument(), schemaVersion: 999 }
    await saveTreeDocument(future)
    vi.mocked(saveTreeDocument).mockClear()

    vi.useFakeTimers()
    const { result } = renderHook(() => usePersistedTree())
    await flushAsync()
    expect(result.current.status.phase).toBe('blocked')
    if (result.current.status.phase === 'blocked') {
      expect(result.current.status.storedVersion).toBe(999)
    }
    expect(Object.keys(useTreeStore.getState().document.persons)).toHaveLength(
      0,
    )

    editStore('花子')
    await advancePastDebounce()
    expect(vi.mocked(saveTreeDocument)).not.toHaveBeenCalled()

    vi.useRealTimers()
    const stored = await loadTreeDocument({ currentVersion: 999 })
    expect(stored.status).toBe('ok')
    if (stored.status === 'ok') {
      expect(stored.document.schemaVersion).toBe(999)
    }
  })

  it('blocked中にreplace(インポート相当)が起きても保存されない', async () => {
    const future = { ...createTreeDocument(), schemaVersion: 999 }
    await saveTreeDocument(future)
    vi.mocked(saveTreeDocument).mockClear()

    vi.useFakeTimers()
    const { result } = renderHook(() => usePersistedTree())
    await flushAsync()
    expect(result.current.status.phase).toBe('blocked')

    // インポート処理はreplaceでdocumentを丸ごと差し替える
    const imported = addPerson(createTreeDocument({ title: 'インポート' }), {
      name: { given: '花子' },
    }).doc
    act(() => {
      useTreeStore.getState().replace(imported)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS * 5)
    })
    expect(vi.mocked(saveTreeDocument)).not.toHaveBeenCalled()
    expect(result.current.status.phase).toBe('blocked')

    vi.useRealTimers()
    const stored = await loadTreeDocument({ currentVersion: 999 })
    expect(stored.status).toBe('ok')
    if (stored.status === 'ok') {
      expect(stored.document.schemaVersion).toBe(999)
    }
  })
})

describe('usePersistedTree: resetAllData', () => {
  it('データ削除後、IndexedDBが空になり空状態のドキュメントへ差し替わる', async () => {
    const doc = createTreeDocument({ title: '既存の家系図' })
    const { doc: withPerson } = addPerson(doc, { name: { given: '太郎' } })
    await saveTreeDocument(withPerson)

    const { result } = await renderReadyHook()
    expect(
      Object.values(useTreeStore.getState().document.persons),
    ).toHaveLength(1)

    await resetData(result)

    expect(Object.keys(useTreeStore.getState().document.persons)).toHaveLength(
      0,
    )
    expect(useTreeStore.getState().canUndo()).toBe(false)
    // デバウンス前の時点ではレコードは削除されたまま
    // (この後デバウンスが経過すると、新しい空ドキュメントが1件保存される仕様。フック側コメント参照)
    vi.useRealTimers()
    const stored = await loadTreeDocument()
    expect(stored).toEqual({ status: 'empty' })
  })

  it('blocked状態からのリセット後も自動保存が正しく再開される', async () => {
    const future = { ...createTreeDocument(), schemaVersion: 999 }
    await saveTreeDocument(future)

    vi.useFakeTimers()
    const { result } = renderHook(() => usePersistedTree())
    await flushAsync()
    expect(result.current.status.phase).toBe('blocked')

    await resetData(result)
    // resetAllData自体も新しい空ドキュメントを保存するため、saving→savedと遷移する
    await advancePastDebounce()
    expect(result.current.status).toEqual({
      phase: 'ready',
      saveState: 'saved',
    })

    editStore('花子')
    expect(result.current.status).toEqual({
      phase: 'ready',
      saveState: 'saving',
    })
    await advancePastDebounce()
    expect(result.current.status).toEqual({
      phase: 'ready',
      saveState: 'saved',
    })

    vi.useRealTimers()
    const stored = await loadTreeDocument()
    expect(stored.status).toBe('ok')
    if (stored.status === 'ok') {
      expect(Object.values(stored.document.persons)).toHaveLength(1)
    }
  })
})

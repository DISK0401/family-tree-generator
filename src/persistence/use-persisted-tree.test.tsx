import 'fake-indexeddb/auto'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addPerson } from '../domain/commands'
import { createTreeDocument } from '../domain/helpers'
import { useTreeStore } from '../store/tree-store'
import { clearTreeDocument, loadTreeDocument, saveTreeDocument } from './db'
import { usePersistedTree } from './use-persisted-tree'

beforeEach(async () => {
  await clearTreeDocument()
  useTreeStore.getState().replace(createTreeDocument())
})

describe('usePersistedTree: 復元', () => {
  it('保存データなしの場合はready(idle)になり、ストアはそのまま(空状態)', async () => {
    const { result } = renderHook(() => usePersistedTree())
    await waitFor(() => {
      expect(result.current.status).toEqual({ phase: 'ready', saveState: 'idle' })
    })
    expect(Object.keys(useTreeStore.getState().document.persons)).toHaveLength(0)
  })

  it('保存済みデータがあれば復元される', async () => {
    const doc = createTreeDocument({ title: '既存の家系図' })
    const { doc: withPerson } = addPerson(doc, { name: { given: '太郎' } })
    await saveTreeDocument(withPerson)

    renderHook(() => usePersistedTree())
    await waitFor(() => {
      expect(useTreeStore.getState().document.title).toBe('既存の家系図')
    })
    expect(Object.values(useTreeStore.getState().document.persons)).toHaveLength(1)
  })
})

describe('usePersistedTree: 自動保存', () => {
  it('編集後デバウンス(800ms)でsaving→savedと遷移し、IndexedDBへ書き込まれる', async () => {
    const { result } = renderHook(() => usePersistedTree())
    await waitFor(() => {
      expect(result.current.status).toEqual({ phase: 'ready', saveState: 'idle' })
    })

    act(() => {
      useTreeStore.getState().apply((d) => addPerson(d, { name: { given: '花子' } }).doc)
    })
    expect(result.current.status).toEqual({ phase: 'ready', saveState: 'saving' })

    await waitFor(
      () => {
        expect(result.current.status).toEqual({ phase: 'ready', saveState: 'saved' })
      },
      { timeout: 2000 },
    )

    const stored = await loadTreeDocument()
    expect(stored.status).toBe('ok')
    if (stored.status === 'ok') {
      expect(Object.values(stored.document.persons)).toHaveLength(1)
    }
  }, 10000)

  it('初回保存時にnavigator.storage.persist()が要求される', async () => {
    const persist = vi.fn().mockResolvedValue(true)
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { persist },
    })

    renderHook(() => usePersistedTree())
    await waitFor(() => expect(useTreeStore.getState()).toBeDefined())

    act(() => {
      useTreeStore.getState().apply((d) => addPerson(d, { name: { given: '花子' } }).doc)
    })
    await waitFor(
      () => {
        expect(persist).toHaveBeenCalledTimes(1)
      },
      { timeout: 2000 },
    )
  }, 10000)
})

describe('usePersistedTree: schemaVersionガード', () => {
  it('保存データが現行より新しい場合はblockedになり、上書きされない', async () => {
    const future = { ...createTreeDocument(), schemaVersion: 999 }
    await saveTreeDocument(future)

    const { result } = renderHook(() => usePersistedTree())
    await waitFor(() => {
      expect(result.current.status.phase).toBe('blocked')
    })
    if (result.current.status.phase === 'blocked') {
      expect(result.current.status.storedVersion).toBe(999)
    }

    expect(Object.keys(useTreeStore.getState().document.persons)).toHaveLength(0)

    act(() => {
      useTreeStore.getState().apply((d) => addPerson(d, { name: { given: '花子' } }).doc)
    })
    await new Promise((r) => setTimeout(r, 1200))

    const stored = await loadTreeDocument({ currentVersion: 999 })
    expect(stored.status).toBe('ok')
    if (stored.status === 'ok') {
      expect(stored.document.schemaVersion).toBe(999)
    }
  }, 10000)
})

describe('usePersistedTree: resetAllData', () => {
  it('データ削除後、IndexedDBが空になり空状態のドキュメントへ差し替わる', async () => {
    const doc = createTreeDocument({ title: '既存の家系図' })
    const { doc: withPerson } = addPerson(doc, { name: { given: '太郎' } })
    await saveTreeDocument(withPerson)

    const { result } = renderHook(() => usePersistedTree())
    await waitFor(() => {
      expect(Object.values(useTreeStore.getState().document.persons)).toHaveLength(1)
    })

    await act(async () => {
      await result.current.resetAllData()
    })

    expect(Object.keys(useTreeStore.getState().document.persons)).toHaveLength(0)
    expect(useTreeStore.getState().canUndo()).toBe(false)
    const stored = await loadTreeDocument()
    expect(stored).toEqual({ status: 'empty' })
  })

  it('blocked状態からのリセット後も自動保存が正しく再開される', async () => {
    const future = { ...createTreeDocument(), schemaVersion: 999 }
    await saveTreeDocument(future)

    const { result } = renderHook(() => usePersistedTree())
    await waitFor(() => {
      expect(result.current.status.phase).toBe('blocked')
    })

    await act(async () => {
      await result.current.resetAllData()
    })
    // resetAllData自体も新しい空ドキュメントを保存するため、saving→savedと遷移する
    await waitFor(
      () => {
        expect(result.current.status).toEqual({ phase: 'ready', saveState: 'saved' })
      },
      { timeout: 2000 },
    )

    act(() => {
      useTreeStore.getState().apply((d) => addPerson(d, { name: { given: '花子' } }).doc)
    })
    expect(result.current.status).toEqual({ phase: 'ready', saveState: 'saving' })
    await waitFor(
      () => {
        expect(result.current.status).toEqual({ phase: 'ready', saveState: 'saved' })
      },
      { timeout: 2000 },
    )
    const stored = await loadTreeDocument()
    expect(stored.status).toBe('ok')
    if (stored.status === 'ok') {
      expect(Object.values(stored.document.persons)).toHaveLength(1)
    }
  }, 10000)
})

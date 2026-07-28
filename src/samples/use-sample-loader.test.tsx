import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTreeDocument } from '../domain/helpers'
import { useTreeStore } from '../store/tree-store'
import { loadSampleDocument } from './load-sample'
import { SAMPLE_LOAD_ERROR_MESSAGE, useSampleLoader } from './use-sample-loader'

/* チャンク読み込み失敗(オフライン等)を注入できるよう、実装を生かしたspyにする */
vi.mock('./load-sample', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./load-sample')>()
  return { ...actual, loadSampleDocument: vi.fn(actual.loadSampleDocument) }
})

beforeEach(() => {
  useTreeStore.getState().replace(createTreeDocument())
  // vi.restoreAllMocksはモジュールモックのvi.fnを対象にしないため、履歴は明示的にクリアする
  vi.mocked(loadSampleDocument).mockClear()
  window.history.replaceState(null, '', '/app')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useSampleLoader: sampleError', () => {
  it('チャンク読み込みに失敗するとsampleErrorへ文言が入り、クエリは再試行用に残る', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})
    window.history.replaceState(null, '', '/app?sample=natsume-soseki')
    vi.mocked(loadSampleDocument).mockRejectedValueOnce(
      new Error('Failed to fetch dynamically imported module'),
    )

    const { result } = renderHook(() => useSampleLoader(true))
    await waitFor(() => {
      expect(result.current.sampleError).toBe(SAMPLE_LOAD_ERROR_MESSAGE)
    })
    expect(consoleErrorSpy).toHaveBeenCalled()
    // クエリを消費しないため、ページのリロードでそのまま再試行できる
    expect(window.location.search).toBe('?sample=natsume-soseki')
    // ストアは変更されない
    expect(Object.keys(useTreeStore.getState().document.persons)).toHaveLength(
      0,
    )
  })

  it('読み込みに成功した場合、sampleErrorはnullのまま', async () => {
    window.history.replaceState(null, '', '/app?sample=natsume-soseki')

    const { result } = renderHook(() => useSampleLoader(true))
    await waitFor(() => {
      expect(useTreeStore.getState().document.title).toBe(
        '夏目漱石の家系図(サンプル)',
      )
    })
    expect(result.current.sampleError).toBeNull()
    expect(window.location.search).toBe('')
  })

  it('sampleクエリが無い場合はsampleErrorはnullのまま(未要求)', () => {
    const { result } = renderHook(() => useSampleLoader(true))
    expect(result.current.sampleError).toBeNull()
    expect(vi.mocked(loadSampleDocument)).not.toHaveBeenCalled()
  })
})

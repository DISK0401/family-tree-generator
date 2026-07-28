import { useCallback, useEffect, useState } from 'react'
import type { TreeDocument } from '../domain/types'
import { useTreeStore } from '../store/tree-store'
import { loadSampleDocument } from './load-sample'

/** サンプルのチャンク読み込みに失敗した際にUIへ表示する文言 */
export const SAMPLE_LOAD_ERROR_MESSAGE =
  'サンプルを読み込めませんでした。通信環境を確認して再度お試しください。'

export interface SampleLoader {
  /** 既存データがあるため上書き確認待ちのサンプル。undefinedなら確認は不要(または未要求) */
  pendingSample: TreeDocument | undefined
  confirmOverwrite: () => void
  cancelOverwrite: () => void
  /** サンプルのチャンク読み込みに失敗した場合のメッセージ。成功・未要求時はnull */
  sampleError: string | null
}

/** sampleクエリを消費済みとしてURLから除去する(リロードでの再確認ループ防止) */
function clearSampleQuery() {
  const url = new URL(window.location.href)
  if (!url.searchParams.has('sample')) return
  url.searchParams.delete('sample')
  window.history.replaceState(null, '', url)
}

/**
 * `/app?sample=<id>` によるサンプル読み込み(design.md D8)。
 * - IndexedDBからの復元完了(active)を待ってから判定する。復元前に読み込むと
 *   「既存データあり」を検出できず、確認なしで上書きしてしまうため
 * - 既存データ(人物1名以上)がある場合は pendingSample を返し、呼び出し側の確認を待つ
 * - 不明なIDはサンプルなしの通常起動として扱う
 * - クエリは判定後すぐ除去する(確認拒否・リロードいずれでも再読み込みしない)
 * - チャンクの取得失敗(オフライン・デプロイ直後の参照切れ)は sampleError で通知する。
 *   この場合クエリは消費せず残し、リロードでそのまま再試行できるようにする
 */
export function useSampleLoader(active: boolean): SampleLoader {
  const replace = useTreeStore((s) => s.replace)
  const [pendingSample, setPendingSample] = useState<TreeDocument | undefined>()
  const [sampleError, setSampleError] = useState<string | null>(null)

  useEffect(() => {
    if (!active) return
    const sampleId = new URLSearchParams(window.location.search).get('sample')
    if (!sampleId) return
    let cancelled = false
    loadSampleDocument(sampleId).then(
      (sampleDocument) => {
        if (cancelled) return
        clearSampleQuery()
        setSampleError(null)
        if (!sampleDocument) return
        const personCount = Object.keys(
          useTreeStore.getState().document.persons,
        ).length
        if (personCount > 0) {
          setPendingSample(sampleDocument)
        } else {
          replace(sampleDocument)
        }
      },
      (error: unknown) => {
        if (cancelled) return
        console.error('サンプルデータの読み込みに失敗しました', error)
        setSampleError(SAMPLE_LOAD_ERROR_MESSAGE)
      },
    )
    return () => {
      cancelled = true
    }
  }, [active, replace])

  const confirmOverwrite = useCallback(() => {
    if (pendingSample) replace(pendingSample)
    setPendingSample(undefined)
  }, [pendingSample, replace])

  const cancelOverwrite = useCallback(() => setPendingSample(undefined), [])

  return { pendingSample, confirmOverwrite, cancelOverwrite, sampleError }
}

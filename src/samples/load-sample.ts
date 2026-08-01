import type { TreeDocument } from '../domain/types'
import { isSampleId, type SampleId } from './sample-meta'

/**
 * サンプルIDごとのデータチャンク読み込み関数。
 * Record<SampleId, ...>で持つことで、サンプル追加時の実装漏れを型検査で担保する。
 * データ本体は動的importで読み込み、エディタ起動時の必須バンドルに含めない。
 */
const SAMPLE_LOADERS: Record<SampleId, () => Promise<TreeDocument>> = {
  'tokugawa-ieyasu': async () =>
    (await import('./data/tokugawa-ieyasu')).tokugawaIeyasuSample,
  'tokugawa-shoguns': async () =>
    (await import('./data/tokugawa-shoguns')).tokugawaShogunsSample,
  'natsume-soseki': async () =>
    (await import('./data/natsume-soseki')).natsumeSosekiSample,
  'shibusawa-eiichi': async () =>
    (await import('./data/shibusawa-eiichi')).shibusawaEiichiSample,
  'modern-family': async () =>
    (await import('./data/modern-family')).modernFamilySample,
}

/**
 * サンプルIDからTreeDocumentを解決する。
 * 不明なIDは undefined(呼び出し側はサンプルなしの通常起動にフォールバックする)。
 * チャンクの取得失敗(オフライン等)はrejectする(呼び出し側でエラー表示すること)。
 * structuredCloneで返し、読み込み後の編集がモジュール側の定数を汚染しないようにする。
 */
export async function loadSampleDocument(
  id: string,
): Promise<TreeDocument | undefined> {
  if (!isSampleId(id)) return undefined
  return structuredClone(await SAMPLE_LOADERS[id]())
}

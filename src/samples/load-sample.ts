import type { TreeDocument } from '../domain/types'
import { isSampleId } from './sample-meta'

/**
 * サンプルIDからTreeDocumentを解決する。
 * データ本体は動的importで読み込み、エディタ起動時の必須バンドルに含めない。
 * 不明なIDは undefined(呼び出し側はサンプルなしの通常起動にフォールバックする)。
 * structuredCloneで返し、読み込み後の編集がモジュール側の定数を汚染しないようにする。
 */
export async function loadSampleDocument(
  id: string,
): Promise<TreeDocument | undefined> {
  if (!isSampleId(id)) return undefined
  switch (id) {
    case 'tokugawa-ieyasu':
      return structuredClone(
        (await import('./data/tokugawa-ieyasu')).tokugawaIeyasuSample,
      )
    case 'natsume-soseki':
      return structuredClone(
        (await import('./data/natsume-soseki')).natsumeSosekiSample,
      )
    case 'shibusawa-eiichi':
      return structuredClone(
        (await import('./data/shibusawa-eiichi')).shibusawaEiichiSample,
      )
    case 'modern-family':
      return structuredClone(
        (await import('./data/modern-family')).modernFamilySample,
      )
  }
}

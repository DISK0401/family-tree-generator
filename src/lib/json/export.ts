import type { TreeDocument } from '../../domain/types'

/**
 * TreeDocument をネイティブJSON形式へ直列化する。内部データモデルそのものを
 * 出力するため、GEDCOMでは表現しきれない情報を含めロスレスにバックアップできる。
 */
export function exportFamilyTreeJsonText(document: TreeDocument): string {
  return JSON.stringify(document, null, 2)
}

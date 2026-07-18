import type { GedcomNode } from '../../domain/gedcomNode'

export type GedcomVersion = '7.0' | '5.5.1'

export type ConversionResult<T> =
  { success: true; value: T } | { success: false; reason: string }

function findChild(node: GedcomNode, tag: string): GedcomNode | undefined {
  return node.children.find((child) => child.tag === tag)
}

/**
 * ヘッダの GEDC.VERS からGEDCOMバージョンを自動判定する。
 * HEADレコードやバージョン情報が見つからない場合は解釈不能として失敗を返す。
 */
export function detectGedcomVersion(
  roots: GedcomNode[],
): ConversionResult<GedcomVersion> {
  const head = roots.find((root) => root.tag === 'HEAD')
  if (!head) {
    return {
      success: false,
      reason:
        'GEDCOMファイルとして読み込めません(HEADレコードが見つかりません)',
    }
  }

  const gedc = findChild(head, 'GEDC')
  const vers = gedc && findChild(gedc, 'VERS')?.value

  if (!vers) {
    return {
      success: false,
      reason:
        'GEDCOMファイルとして読み込めません(バージョン情報が見つかりません)',
    }
  }

  if (vers.startsWith('7.')) {
    return { success: true, value: '7.0' }
  }
  if (vers.startsWith('5.5')) {
    return { success: true, value: '5.5.1' }
  }

  return { success: false, reason: `未対応のGEDCOMバージョンです: ${vers}` }
}

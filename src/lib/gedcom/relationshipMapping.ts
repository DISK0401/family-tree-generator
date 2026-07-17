import type { FamilyRelationshipType } from '../../domain/family'
import type { GedcomNode } from '../../domain/gedcomNode'
import type { GedcomVersion } from './version'
import { findChild } from './nodeHelpers'

export interface RelationshipExportResult {
  nodes: GedcomNode[]
  warnings: string[]
}

const DEFACTO_TYPE_LABEL = '事実婚'

/**
 * 家族の関係種別をGEDCOMのイベント構造へ変換する。事実婚は7.0では汎用の
 * EVEN/TYPE構造で表現できるが、5.5.1には標準の対応構造がないためNOTEで
 * 保全し警告を出す(design.md D9 / gedcom-import-export spec 参照)。
 */
export function relationshipTypeToGedcomNodes(
  type: FamilyRelationshipType | undefined,
  version: GedcomVersion,
): RelationshipExportResult {
  switch (type) {
    case 'marriage':
      return { nodes: [{ tag: 'MARR', children: [] }], warnings: [] }
    case 'divorced':
      return { nodes: [{ tag: 'DIV', children: [] }], warnings: [] }
    case 'annulled':
      return { nodes: [{ tag: 'ANUL', children: [] }], warnings: [] }
    case 'defacto':
      if (version === '7.0') {
        return {
          nodes: [
            {
              tag: 'EVEN',
              children: [
                { tag: 'TYPE', value: DEFACTO_TYPE_LABEL, children: [] },
              ],
            },
          ],
          warnings: [],
        }
      }
      return {
        nodes: [
          {
            tag: 'NOTE',
            value:
              '事実婚(GEDCOM 5.5.1では標準的な関係種別として表現できないため注記として保存)',
            children: [],
          },
        ],
        warnings: [
          '関係種別「事実婚」はGEDCOM 5.5.1では標準表現できないため代替表現(NOTE)で出力した',
        ],
      }
    case 'unknown':
    case undefined:
      return { nodes: [], warnings: [] }
  }
}

/** FAMレコードのイベント構造から関係種別を推定する。 */
export function gedcomNodesToRelationshipType(
  famNode: GedcomNode,
): FamilyRelationshipType {
  if (findChild(famNode, 'DIV')) {
    return 'divorced'
  }
  if (findChild(famNode, 'ANUL')) {
    return 'annulled'
  }
  if (findChild(famNode, 'MARR')) {
    return 'marriage'
  }
  const even = findChild(famNode, 'EVEN')
  if (even && findChild(even, 'TYPE')?.value === DEFACTO_TYPE_LABEL) {
    return 'defacto'
  }
  return 'unknown'
}

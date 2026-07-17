import type { FamilyTreeData } from '../../domain/model'
import { CURRENT_SCHEMA_VERSION, type FamilyTreeExportV1 } from './schema'

/**
 * 内部データモデルをネイティブJSON形式(v1)のオブジェクトへ直列化する。
 * 保全済みGEDCOMタグ・日付原文・別表記を含む全情報をロスレスに出力する。
 */
export function exportFamilyTreeJson(data: FamilyTreeData): FamilyTreeExportV1 {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    people: data.people,
    families: data.families,
  }
}

export function exportFamilyTreeJsonText(data: FamilyTreeData): string {
  return JSON.stringify(exportFamilyTreeJson(data), null, 2)
}

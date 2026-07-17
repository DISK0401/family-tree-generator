import { z } from 'zod'
import type { FamilyTreeData } from '../../domain/model'
import { familyTreeExportSchemaV1 } from './schema'

export interface JsonImportSuccess {
  success: true
  data: FamilyTreeData
}

export interface JsonImportFailure {
  success: false
  reason: string
}

export type JsonImportResult = JsonImportSuccess | JsonImportFailure

const versionProbeSchema = z
  .object({ schemaVersion: z.unknown().optional() })
  .loose()

/**
 * ネイティブJSON形式をインポートする。schemaVersionの欠落・未知バージョン・
 * スキーマ不一致の場合はインポートを中断し、既存データは変更しない(design.md D7)。
 */
export function importFamilyTreeJson(text: string): JsonImportResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return {
      success: false,
      reason: 'JSONとして読み込めませんでした(構文が不正です)',
    }
  }

  const probe = versionProbeSchema.safeParse(parsed)
  if (!probe.success) {
    return { success: false, reason: 'JSONファイルの構造が不正です' }
  }

  const version = probe.data.schemaVersion
  if (version === undefined) {
    return {
      success: false,
      reason:
        'schemaVersionが見つかりません。本アプリでエクスポートしたファイルではない可能性があります',
    }
  }

  if (version === 1) {
    const result = familyTreeExportSchemaV1.safeParse(parsed)
    if (!result.success) {
      const details = result.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join(', ')
      return {
        success: false,
        reason: `JSONファイルの内容が不正です(${details})`,
      }
    }
    return {
      success: true,
      data: { people: result.data.people, families: result.data.families },
    }
  }

  return {
    success: false,
    reason: `未対応のschemaVersionです(${String(version)})。新しいバージョンのアプリでエクスポートされた可能性があります`,
  }
}

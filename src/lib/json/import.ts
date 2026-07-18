import { z } from 'zod'
import { SCHEMA_VERSION, type TreeDocument } from '../../domain/types'
import { treeDocumentSchema } from './schema'

export interface JsonImportSuccess {
  success: true
  document: TreeDocument
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
 * スキーマ不一致の場合はインポートを中断し、既存データは変更しない。
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

  if (version === SCHEMA_VERSION) {
    const result = treeDocumentSchema.safeParse(parsed)
    if (!result.success) {
      const details = result.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join(', ')
      return {
        success: false,
        reason: `JSONファイルの内容が不正です(${details})`,
      }
    }
    return { success: true, document: result.data as TreeDocument }
  }

  return {
    success: false,
    reason: `未対応のschemaVersionです(${String(version)})。新しいバージョンのアプリでエクスポートされた可能性があります`,
  }
}

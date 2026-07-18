import { openDB, type IDBPDatabase } from 'idb'
import { SCHEMA_VERSION, type TreeDocument } from '../domain/types'

/**
 * IndexedDBへのTreeDocument永続化レイヤ。
 * 家系図は1端末につき1ドキュメント(design.md D5・Open Questions参照)のため、
 * 固定キーでの単一レコード保存とする。
 */

const DB_NAME = 'family-tree-generator'
const DB_VERSION = 1
const STORE_NAME = 'tree'
const DOCUMENT_KEY = 'current'

async function openTreeDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    },
  })
}

export async function saveTreeDocument(doc: TreeDocument): Promise<void> {
  const db = await openTreeDb()
  await db.put(STORE_NAME, doc, DOCUMENT_KEY)
  db.close()
}

export async function clearTreeDocument(): Promise<void> {
  const db = await openTreeDb()
  await db.delete(STORE_NAME, DOCUMENT_KEY)
  db.close()
}

/**
 * schemaVersionのマイグレーション定義。
 * キーは移行元バージョン、値はそのバージョンから次のバージョンへ変換する関数。
 * 現行SCHEMA_VERSION=1のため本番では空だが、将来のモデル変更時にここへ追記する。
 */
export type MigrationStep = (doc: TreeDocument) => TreeDocument
export const MIGRATIONS: Record<number, MigrationStep> = {}

function migrate(
  doc: TreeDocument,
  targetVersion: number,
  migrations: Record<number, MigrationStep>,
): TreeDocument {
  let current = doc
  while (current.schemaVersion < targetVersion) {
    const step = migrations[current.schemaVersion]
    if (!step) {
      throw new Error(
        `schemaVersion ${current.schemaVersion} → ${current.schemaVersion + 1} のマイグレーションが未定義です`,
      )
    }
    current = step(current)
  }
  return current
}

export type LoadResult =
  | { status: 'empty' }
  | { status: 'ok'; document: TreeDocument }
  | { status: 'migrated'; document: TreeDocument; fromVersion: number }
  | { status: 'too-new'; storedVersion: number; currentVersion: number }

/**
 * 保存済みTreeDocumentを読み込む。
 * - 保存データなし → empty
 * - 保存データのschemaVersionが現行と一致 → ok
 * - 現行より古い → マイグレーションを適用して migrated
 * - 現行より新しい → 読み取り・上書きを中止して too-new(呼び出し側は警告を表示し、saveを呼ばないこと)
 */
export async function loadTreeDocument(options?: {
  currentVersion?: number
  migrations?: Record<number, MigrationStep>
}): Promise<LoadResult> {
  const currentVersion = options?.currentVersion ?? SCHEMA_VERSION
  const migrations = options?.migrations ?? MIGRATIONS

  const db = await openTreeDb()
  const stored = (await db.get(STORE_NAME, DOCUMENT_KEY)) as TreeDocument | undefined
  db.close()

  if (!stored) return { status: 'empty' }
  if (stored.schemaVersion > currentVersion) {
    return { status: 'too-new', storedVersion: stored.schemaVersion, currentVersion }
  }
  if (stored.schemaVersion < currentVersion) {
    const migrated = migrate(stored, currentVersion, migrations)
    return { status: 'migrated', document: migrated, fromVersion: stored.schemaVersion }
  }
  return { status: 'ok', document: stored }
}

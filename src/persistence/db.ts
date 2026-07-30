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
    // 他タブが古いDBバージョンを開いたまま等の競合は、失敗として扱わず警告ログのみ残す
    // (単一ドキュメント・単一ストアのためデータ操作自体は待機後に成立する)
    blocked(currentVersion, blockedVersion) {
      console.warn(
        `IndexedDBのオープンが他の接続にブロックされています(現行 v${currentVersion} / 待機中 v${blockedVersion})`,
      )
    },
    blocking(currentVersion, blockedVersion) {
      console.warn(
        `他のタブが新しいバージョンのIndexedDBを開こうとしています(このタブ v${currentVersion} / 要求 v${blockedVersion})`,
      )
    },
  })
}

export async function saveTreeDocument(doc: TreeDocument): Promise<void> {
  const db = await openTreeDb()
  try {
    await db.put(STORE_NAME, doc, DOCUMENT_KEY)
  } finally {
    // 書き込み失敗時も接続をリークさせない(close漏れは以降のopenをブロックし得る)
    db.close()
  }
}

export async function clearTreeDocument(): Promise<void> {
  const db = await openTreeDb()
  try {
    await db.delete(STORE_NAME, DOCUMENT_KEY)
  } finally {
    db.close()
  }
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
    const next = step(current)
    // stepがschemaVersionを進め忘れると無限ループするため、進んでいなければ即座に失敗させる
    if (next.schemaVersion <= current.schemaVersion) {
      throw new Error(
        `schemaVersion ${current.schemaVersion} のマイグレーションがバージョンを進めていません(結果: ${next.schemaVersion})`,
      )
    }
    current = next
  }
  return current
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 読み出したレコードの軽量シェイプ検証。
 * IndexedDBのレコードは別のコード経路・手動操作でも書き換わり得るため、
 * 破損データを信じて描画してアプリ全体がクラッシュするのを防ぐ最低限の形だけ確認する
 * (フィールド単位の完全検証はインポート時のzodスキーマの領分)。
 */
function isTreeDocumentShape(value: unknown): value is TreeDocument {
  if (!isPlainRecord(value)) return false
  return (
    typeof value.schemaVersion === 'number' &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.updatedAt === 'string' &&
    isPlainRecord(value.persons) &&
    isPlainRecord(value.families)
  )
}

export type LoadResult =
  | { status: 'empty' }
  | { status: 'ok'; document: TreeDocument }
  | { status: 'migrated'; document: TreeDocument; fromVersion: number }
  | { status: 'too-new'; storedVersion: number; currentVersion: number }
  | { status: 'corrupt' }

/**
 * 保存済みTreeDocumentを読み込む。
 * - 保存データなし → empty
 * - TreeDocumentの形をしていない → corrupt(呼び出し側は自動保存を止め、上書きしないこと)
 * - 保存データのschemaVersionが現行と一致 → ok
 * - 現行より古い → マイグレーションを適用して migrated
 * - 現行より新しい → 読み取り・上書きを中止して too-new(呼び出し側は警告を表示し、saveを呼ばないこと)
 *
 * corruptの場合もレコード自体は削除しない。ユーザーがDevTools等で取り出して
 * 手動レスキューする余地を残すため、消すのは明示的なresetAllData(全削除)のみとする。
 */
export async function loadTreeDocument(options?: {
  currentVersion?: number
  migrations?: Record<number, MigrationStep>
}): Promise<LoadResult> {
  const currentVersion = options?.currentVersion ?? SCHEMA_VERSION
  const migrations = options?.migrations ?? MIGRATIONS

  const db = await openTreeDb()
  let stored: unknown
  try {
    stored = await db.get(STORE_NAME, DOCUMENT_KEY)
  } finally {
    db.close()
  }

  if (stored === undefined) return { status: 'empty' }
  if (!isTreeDocumentShape(stored)) return { status: 'corrupt' }
  if (stored.schemaVersion > currentVersion) {
    return {
      status: 'too-new',
      storedVersion: stored.schemaVersion,
      currentVersion,
    }
  }
  if (stored.schemaVersion < currentVersion) {
    const migrated = migrate(stored, currentVersion, migrations)
    return {
      status: 'migrated',
      document: migrated,
      fromVersion: stored.schemaVersion,
    }
  }
  return { status: 'ok', document: stored }
}

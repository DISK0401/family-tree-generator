import 'fake-indexeddb/auto'
import { openDB } from 'idb'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTreeDocument } from '../domain/helpers'
import type { TreeDocument } from '../domain/types'
import { clearTreeDocument, loadTreeDocument, saveTreeDocument } from './db'

beforeEach(async () => {
  await clearTreeDocument()
})

/** アプリのdb層を経由せず、生のレコードを直接書き込む(破損データのシミュレーション用) */
async function writeRawRecord(value: unknown): Promise<void> {
  const db = await openDB('family-tree-generator', 1, {
    upgrade(database) {
      if (!database.objectStoreNames.contains('tree')) {
        database.createObjectStore('tree')
      }
    },
  })
  try {
    await db.put('tree', value, 'current')
  } finally {
    db.close()
  }
}

/** 生のレコードを直接読み出す(削除されていないことの確認用) */
async function readRawRecord(): Promise<unknown> {
  const db = await openDB('family-tree-generator', 1)
  try {
    return await db.get('tree', 'current')
  } finally {
    db.close()
  }
}

describe('saveTreeDocument / loadTreeDocument', () => {
  it('保存前はemptyが返る', async () => {
    const r = await loadTreeDocument()
    expect(r).toEqual({ status: 'empty' })
  })

  it('保存したドキュメントを同じ内容で読み込める(ok)', async () => {
    const doc = createTreeDocument({ title: 'テスト家系図' })
    await saveTreeDocument(doc)
    const r = await loadTreeDocument()
    expect(r.status).toBe('ok')
    if (r.status === 'ok') expect(r.document).toEqual(doc)
  })
})

describe('破損データ', () => {
  it('TreeDocumentの形をしていないレコードはcorruptが返る', async () => {
    await writeRawRecord({ hello: 'world' })
    const r = await loadTreeDocument()
    expect(r).toEqual({ status: 'corrupt' })
  })

  it('schemaVersionが数値でないレコードはcorruptが返る', async () => {
    const doc = createTreeDocument()
    await writeRawRecord({ ...doc, schemaVersion: '1' })
    const r = await loadTreeDocument()
    expect(r).toEqual({ status: 'corrupt' })
  })

  it('persons/familiesがプレーンオブジェクトでないレコードはcorruptが返る', async () => {
    const doc = createTreeDocument()
    await writeRawRecord({ ...doc, persons: ['not-a-record'] })
    expect(await loadTreeDocument()).toEqual({ status: 'corrupt' })
    await writeRawRecord({ ...doc, families: null })
    expect(await loadTreeDocument()).toEqual({ status: 'corrupt' })
  })

  it('titleが文字列でないレコードはcorruptが返る', async () => {
    const doc = createTreeDocument()
    await writeRawRecord({ ...doc, title: 42 })
    expect(await loadTreeDocument()).toEqual({ status: 'corrupt' })
  })

  it('corruptでもレコードは削除されず、手動レスキューの余地が残る', async () => {
    const broken = { hello: 'world' }
    await writeRawRecord(broken)
    await loadTreeDocument()
    await loadTreeDocument() // 何度読んでも消えない
    expect(await readRawRecord()).toEqual(broken)
  })
})

describe('schemaVersionガード', () => {
  it('旧バージョンデータはマイグレーションが適用されmigratedとして読み込まれる', async () => {
    const doc = createTreeDocument()
    const old = { ...doc, schemaVersion: 1 }
    await saveTreeDocument(old)

    const migrations = { 1: (d: typeof old) => ({ ...d, schemaVersion: 2 }) }
    const r = await loadTreeDocument({ currentVersion: 2, migrations })
    expect(r.status).toBe('migrated')
    if (r.status === 'migrated') {
      expect(r.document.schemaVersion).toBe(2)
      expect(r.fromVersion).toBe(1)
    }
  })

  it('多段マイグレーション(1→2→3)がチェーンで適用される', async () => {
    const doc = createTreeDocument({ title: '多段移行テスト' })
    await saveTreeDocument({ ...doc, schemaVersion: 1 })

    // 各stepの適用順を追跡できるよう、titleへ足跡を残す
    const migrations = {
      1: (d: TreeDocument) => ({
        ...d,
        schemaVersion: 2,
        title: `${d.title}→v2`,
      }),
      2: (d: TreeDocument) => ({
        ...d,
        schemaVersion: 3,
        title: `${d.title}→v3`,
      }),
    }
    const r = await loadTreeDocument({ currentVersion: 3, migrations })
    expect(r.status).toBe('migrated')
    if (r.status === 'migrated') {
      expect(r.document.schemaVersion).toBe(3)
      expect(r.document.title).toBe('多段移行テスト→v2→v3')
      expect(r.fromVersion).toBe(1)
    }
  })

  it('新バージョンデータは読み取り・上書きされずtoo-newが返る', async () => {
    const doc = createTreeDocument()
    const future = { ...doc, schemaVersion: 3 }
    await saveTreeDocument(future)

    const r = await loadTreeDocument({ currentVersion: 2 })
    expect(r).toEqual({
      status: 'too-new',
      storedVersion: 3,
      currentVersion: 2,
    })

    // 上書きされていないことを確認(現行バージョンで再読込しても元のまま)
    const raw = await loadTreeDocument({ currentVersion: 3 })
    expect(raw.status).toBe('ok')
  })

  it('マイグレーション未定義のバージョン差はエラーになる', async () => {
    const doc = createTreeDocument()
    await saveTreeDocument({ ...doc, schemaVersion: 1 })
    await expect(
      loadTreeDocument({ currentVersion: 2, migrations: {} }),
    ).rejects.toThrow(/マイグレーション/)
  })

  it('schemaVersionを進めないマイグレーションは無限ループせずエラーになる', async () => {
    const doc = createTreeDocument()
    await saveTreeDocument({ ...doc, schemaVersion: 1 })
    const migrations = { 1: (d: TreeDocument) => ({ ...d }) } // 進め忘れ
    await expect(
      loadTreeDocument({ currentVersion: 2, migrations }),
    ).rejects.toThrow(/バージョンを進めていません/)
  })

  it('実際のMIGRATIONS定義でschemaVersion1→2(出生順の追加)が既定値のまま移行できる', async () => {
    const doc = createTreeDocument({ title: '出生順マイグレーションテスト' })
    await saveTreeDocument({ ...doc, schemaVersion: 1 })

    const r = await loadTreeDocument() // options省略=実際のSCHEMA_VERSION/MIGRATIONSを使う
    expect(r.status).toBe('migrated')
    if (r.status === 'migrated') {
      expect(r.document.schemaVersion).toBe(2)
      expect(r.fromVersion).toBe(1)
      expect(r.document.title).toBe('出生順マイグレーションテスト')
    }
  })
})

describe('clearTreeDocument', () => {
  it('削除後はemptyになる', async () => {
    await saveTreeDocument(createTreeDocument())
    await clearTreeDocument()
    const r = await loadTreeDocument()
    expect(r).toEqual({ status: 'empty' })
  })
})

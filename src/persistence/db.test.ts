import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTreeDocument } from '../domain/helpers'
import { clearTreeDocument, loadTreeDocument, saveTreeDocument } from './db'

beforeEach(async () => {
  await clearTreeDocument()
})

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

  it('新バージョンデータは読み取り・上書きされずtoo-newが返る', async () => {
    const doc = createTreeDocument()
    const future = { ...doc, schemaVersion: 3 }
    await saveTreeDocument(future)

    const r = await loadTreeDocument({ currentVersion: 2 })
    expect(r).toEqual({ status: 'too-new', storedVersion: 3, currentVersion: 2 })

    // 上書きされていないことを確認(現行バージョンで再読込しても元のまま)
    const raw = await loadTreeDocument({ currentVersion: 3 })
    expect(raw.status).toBe('ok')
  })

  it('マイグレーション未定義のバージョン差はエラーになる', async () => {
    const doc = createTreeDocument()
    await saveTreeDocument({ ...doc, schemaVersion: 1 })
    await expect(loadTreeDocument({ currentVersion: 2, migrations: {} })).rejects.toThrow(
      /マイグレーション/,
    )
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

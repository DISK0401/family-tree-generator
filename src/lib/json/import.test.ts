import { describe, expect, it } from 'vitest'
import { createTreeDocument } from '../../domain/helpers'
import { addPerson } from '../../domain/commands'
import { exportFamilyTreeJsonText } from './export'
import { importFamilyTreeJson } from './import'

describe('importFamilyTreeJson', () => {
  it('本アプリがエクスポートしたJSONを正常にインポートする', () => {
    let document = createTreeDocument()
    document = addPerson(document, { name: { given: '太郎' } }).doc
    const text = exportFamilyTreeJsonText(document)

    const result = importFamilyTreeJson(text)

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(Object.keys(result.document.persons)).toHaveLength(1)
  })

  it('構文が不正なJSONは中断する', () => {
    const result = importFamilyTreeJson('{ invalid json')
    expect(result.success).toBe(false)
  })

  it('schemaVersionが無いJSONは中断する', () => {
    const result = importFamilyTreeJson(
      JSON.stringify({ persons: {}, families: {} }),
    )

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.reason).toContain('schemaVersion')
  })

  it('未知のschemaVersionは中断する', () => {
    const result = importFamilyTreeJson(
      JSON.stringify({
        schemaVersion: 999,
        id: 'x',
        title: 't',
        updatedAt: '2026-01-01T00:00:00.000Z',
        persons: {},
        families: {},
      }),
    )

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.reason).toContain('999')
    expect(result.reason).toContain('新しいバージョン')
  })

  it('必須フィールドが欠けたJSONは中断する', () => {
    const result = importFamilyTreeJson(
      JSON.stringify({
        schemaVersion: 1,
        id: 'x',
        title: 't',
        updatedAt: '2026-01-01T00:00:00.000Z',
        persons: { p1: { id: 'p1', name: { given: 123 }, gender: 'unknown' } },
        families: {},
      }),
    )

    expect(result.success).toBe(false)
  })
})

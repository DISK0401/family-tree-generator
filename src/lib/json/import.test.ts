import { describe, expect, it } from 'vitest'
import { createId } from '../../domain/id'
import type { FamilyTreeData } from '../../domain/model'
import { exportFamilyTreeJsonText } from './export'
import { importFamilyTreeJson } from './import'

describe('importFamilyTreeJson', () => {
  it('本アプリがエクスポートしたJSONを正常にインポートする', () => {
    const data: FamilyTreeData = {
      people: [{ id: createId(), name: { given: '太郎' } }],
      families: [],
    }
    const text = exportFamilyTreeJsonText(data)

    const result = importFamilyTreeJson(text)

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.people).toHaveLength(1)
    expect(result.data.people[0].name?.given).toBe('太郎')
  })

  it('構文が不正なJSONは中断する', () => {
    const result = importFamilyTreeJson('{ invalid json')

    expect(result.success).toBe(false)
  })

  it('schemaVersionが無いJSONは中断する', () => {
    const result = importFamilyTreeJson(
      JSON.stringify({ people: [], families: [] }),
    )

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.reason).toContain('schemaVersion')
  })

  it('未知のschemaVersionは中断する', () => {
    const result = importFamilyTreeJson(
      JSON.stringify({ schemaVersion: 999, people: [], families: [] }),
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
        exportedAt: '2026-01-01T00:00:00.000Z',
        people: [{ id: 'p1', name: { given: 123 } }],
        families: [],
      }),
    )

    expect(result.success).toBe(false)
  })
})

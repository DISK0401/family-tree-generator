import { describe, expect, it } from 'vitest'
import { createTreeDocument } from '../../domain/helpers'
import { addPerson, addSpouse } from '../../domain/commands'
import type { TreeDocument } from '../../domain/types'
import { exportFamilyTreeJsonText } from './export'
import { importFamilyTreeJson } from './import'

function baseDocument(): TreeDocument {
  return {
    schemaVersion: 1,
    id: 'doc-1',
    title: 'テスト',
    updatedAt: '2026-01-01T00:00:00.000Z',
    persons: {},
    families: {},
  }
}

function personOf(id: string): TreeDocument['persons'][string] {
  return { id, name: { given: id }, gender: 'unknown' }
}

describe('importFamilyTreeJson', () => {
  it('本アプリがエクスポートしたJSONを正常にインポートする', () => {
    let document = createTreeDocument()
    document = addPerson(document, { name: { given: '太郎' } }).doc
    const text = exportFamilyTreeJsonText(document)

    const result = importFamilyTreeJson(text)

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(Object.keys(result.document.persons)).toHaveLength(1)
    expect(result.warnings).toEqual([])
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

  it('未知のschemaVersion(数値)は「新しいバージョン」の可能性として中断する', () => {
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

  it('数値でないschemaVersionは「新しいバージョン」とは区別して中断する', () => {
    const result = importFamilyTreeJson(
      JSON.stringify({ ...baseDocument(), schemaVersion: '1' }),
    )

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.reason).toContain('数値ではありません')
    expect(result.reason).not.toContain('新しいバージョン')
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

describe('importFamilyTreeJson ドキュメントレベル検証', () => {
  it('personsのキーとidの不一致は修復不能としてエラーにする', () => {
    const document = {
      ...baseDocument(),
      persons: { p1: personOf('p2') },
    }

    const result = importFamilyTreeJson(JSON.stringify(document))

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.reason).toContain('一致しません')
  })

  it('familiesのキーとidの不一致は修復不能としてエラーにする', () => {
    const document = {
      ...baseDocument(),
      families: {
        f1: {
          id: 'f2',
          spouseIds: [],
          kind: 'unknown',
          events: [],
          children: [],
        },
      },
    }

    const result = importFamilyTreeJson(JSON.stringify(document))

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.reason).toContain('一致しません')
  })

  it('存在しない日付(2/31)はエラーにする', () => {
    const document = {
      ...baseDocument(),
      persons: {
        p1: {
          ...personOf('p1'),
          birth: {
            type: 'birth',
            date: {
              original: '1900年2月31日',
              qualifier: 'exact',
              date: { year: 1900, month: 2, day: 31 },
            },
          },
        },
      },
    }

    const result = importFamilyTreeJson(JSON.stringify(document))

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.reason).toContain('存在しない日付')
  })

  it('うるう年の2/29は受理し、平年の2/29は拒否する', () => {
    const withFebruary29 = (year: number) => ({
      ...baseDocument(),
      persons: {
        p1: {
          ...personOf('p1'),
          birth: {
            type: 'birth',
            date: {
              original: `${year}年2月29日`,
              qualifier: 'exact',
              date: { year, month: 2, day: 29 },
            },
          },
        },
      },
    })

    expect(
      importFamilyTreeJson(JSON.stringify(withFebruary29(2024))).success,
    ).toBe(true)
    expect(
      importFamilyTreeJson(JSON.stringify(withFebruary29(2023))).success,
    ).toBe(false)
  })
})

describe('importFamilyTreeJson 警告付き修復', () => {
  it('存在しない人物へのspouseIds参照は該当リンクのみ除去して取り込む', () => {
    const document = {
      ...baseDocument(),
      persons: { p1: personOf('p1') },
      families: {
        f1: {
          id: 'f1',
          spouseIds: ['p1', 'ghost'],
          kind: 'unknown',
          events: [],
          children: [],
        },
      },
    }

    const result = importFamilyTreeJson(JSON.stringify(document))

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.document.families.f1.spouseIds).toEqual(['p1'])
    expect(
      result.warnings.some(
        (w) => w.includes('ghost') && w.includes('配偶者参照を除去'),
      ),
    ).toBe(true)
  })

  it('存在しない人物へのchildId参照は該当リンクのみ除去して取り込む', () => {
    const document = {
      ...baseDocument(),
      persons: { p1: personOf('p1'), c1: personOf('c1') },
      families: {
        f1: {
          id: 'f1',
          spouseIds: ['p1'],
          kind: 'unknown',
          events: [],
          children: [
            { childId: 'c1', pedigree: 'biological' },
            { childId: 'ghost', pedigree: 'biological' },
          ],
        },
      },
    }

    const result = importFamilyTreeJson(JSON.stringify(document))

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.document.families.f1.children).toEqual([
      { childId: 'c1', pedigree: 'biological' },
    ])
    expect(
      result.warnings.some(
        (w) => w.includes('ghost') && w.includes('子参照を除去'),
      ),
    ).toBe(true)
  })

  it('spouseIdsの重複は1件にまとめて取り込む', () => {
    const document = {
      ...baseDocument(),
      persons: { p1: personOf('p1') },
      families: {
        f1: {
          id: 'f1',
          spouseIds: ['p1', 'p1'],
          kind: 'unknown',
          events: [],
          children: [],
        },
      },
    }

    const result = importFamilyTreeJson(JSON.stringify(document))

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.document.families.f1.spouseIds).toEqual(['p1'])
    expect(result.warnings.some((w) => w.includes('重複する配偶者参照'))).toBe(
      true,
    )
  })

  it('childIdの重複は1件にまとめて取り込む', () => {
    const document = {
      ...baseDocument(),
      persons: { p1: personOf('p1'), c1: personOf('c1') },
      families: {
        f1: {
          id: 'f1',
          spouseIds: ['p1'],
          kind: 'unknown',
          events: [],
          children: [
            { childId: 'c1', pedigree: 'biological' },
            { childId: 'c1', pedigree: 'adopted' },
          ],
        },
      },
    }

    const result = importFamilyTreeJson(JSON.stringify(document))

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.document.families.f1.children).toEqual([
      { childId: 'c1', pedigree: 'biological' },
    ])
    expect(result.warnings.some((w) => w.includes('重複する子参照'))).toBe(true)
  })

  it('betweenなのにdate2が無い日付は警告付きでexactへ降格する', () => {
    const document = {
      ...baseDocument(),
      persons: {
        p1: {
          ...personOf('p1'),
          birth: {
            type: 'birth',
            date: {
              original: '1900年から1910年の間',
              qualifier: 'between',
              date: { year: 1900 },
            },
          },
        },
      },
    }

    const result = importFamilyTreeJson(JSON.stringify(document))

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.document.persons.p1.birth?.date?.qualifier).toBe('exact')
    expect(result.warnings.some((w) => w.includes('between'))).toBe(true)
  })

  it('date2を持つ正しいbetweenはそのまま取り込む', () => {
    const document = {
      ...baseDocument(),
      persons: {
        p1: {
          ...personOf('p1'),
          birth: {
            type: 'birth',
            date: {
              original: '1900年から1910年の間',
              qualifier: 'between',
              date: { year: 1900 },
              date2: { year: 1910 },
            },
          },
        },
      },
    }

    const result = importFamilyTreeJson(JSON.stringify(document))

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.document.persons.p1.birth?.date?.qualifier).toBe('between')
    expect(result.warnings).toEqual([])
  })

  it('修復のない正常なドキュメントでは警告を出さない', () => {
    let document = createTreeDocument()
    const a = addPerson(document, { name: { given: 'A' } })
    document = a.doc
    document = addSpouse(document, a.personId, { name: { given: 'B' } }).doc

    const result = importFamilyTreeJson(exportFamilyTreeJsonText(document))

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.warnings).toEqual([])
  })
})

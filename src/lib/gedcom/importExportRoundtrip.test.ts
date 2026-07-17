import { describe, expect, it } from 'vitest'
import { importGedcom } from './import'
import { exportGedcom } from './export'
import { parseGedcomText } from './parser'
import { findChild } from './nodeHelpers'

function bytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

describe('同一バージョンのラウンドトリップ保全', () => {
  it('独自タグ_MYTAGを5.5.1インポート→5.5.1再エクスポートで復元する', () => {
    const original = [
      '0 HEAD',
      '1 GEDC',
      '2 VERS 5.5.1',
      '1 CHAR UTF-8',
      '0 @I1@ INDI',
      '1 NAME Test /Person/',
      '1 _MYTAG custom value',
      '2 _SUBTAG nested',
      '0 TRLR',
    ].join('\n')

    const imported = importGedcom(bytesOf(original))
    expect(imported.success).toBe(true)
    if (!imported.success) return

    const person = imported.data.people[0]
    const myTag = person.unmappedTags?.find((tag) => tag.tag === '_MYTAG')
    expect(myTag).toBeDefined()
    expect(myTag?.value).toBe('custom value')
    expect(findChild(myTag!, '_SUBTAG')?.value).toBe('nested')

    const { text: reExported } = exportGedcom(
      imported.data,
      '5.5.1',
      imported.version,
    )
    const reImported = importGedcom(new TextEncoder().encode(reExported))
    expect(reImported.success).toBe(true)
    if (!reImported.success) return

    const roundTrippedTag = reImported.data.people[0].unmappedTags?.find(
      (tag) => tag.tag === '_MYTAG',
    )
    expect(roundTrippedTag?.value).toBe('custom value')
    expect(findChild(roundTrippedTag!, '_SUBTAG')?.value).toBe('nested')

    const { roots } = parseGedcomText(reExported)
    const indi = roots.find((root) => root.tag === 'INDI')!
    expect(findChild(indi, '_MYTAG')?.value).toBe('custom value')
  })

  it('バージョンをまたぐ再エクスポート(5.5.1→7.0)では警告が出る', () => {
    const original = [
      '0 HEAD',
      '1 GEDC',
      '2 VERS 5.5.1',
      '1 CHAR UTF-8',
      '0 @I1@ INDI',
      '1 NAME Test /Person/',
      '1 _MYTAG custom value',
      '0 TRLR',
    ].join('\n')

    const imported = importGedcom(bytesOf(original))
    expect(imported.success).toBe(true)
    if (!imported.success) return

    const { warnings } = exportGedcom(imported.data, '7.0', imported.version)
    expect(warnings.length).toBeGreaterThan(0)
  })
})

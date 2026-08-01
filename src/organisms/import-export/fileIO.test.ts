import { describe, expect, it } from 'vitest'
import { detectFileFormat, formatExportTimestamp } from './fileIO'

describe('formatExportTimestamp', () => {
  it('固定日時を14桁のyyyyMMddHHmmss形式へ書式化する', () => {
    expect(formatExportTimestamp(new Date(2026, 6, 18, 14, 30, 22))).toBe(
      '20260718143022',
    )
  })

  it('月日時分秒が1桁の場合はゼロ埋めする', () => {
    expect(formatExportTimestamp(new Date(2026, 0, 1, 0, 0, 5))).toBe(
      '20260101000005',
    )
  })
})

describe('detectFileFormat', () => {
  it('拡張子からGEDCOM/JSON形式を判定する', () => {
    expect(detectFileFormat('family.ged')).toBe('gedcom')
    expect(detectFileFormat('family.gedcom')).toBe('gedcom')
    expect(detectFileFormat('family.json')).toBe('json')
    expect(detectFileFormat('family.txt')).toBe('unknown')
  })

  it('大文字の拡張子(.GED/.JSON)も判定する', () => {
    expect(detectFileFormat('FAMILY.GED')).toBe('gedcom')
    expect(detectFileFormat('Family.Gedcom')).toBe('gedcom')
    expect(detectFileFormat('FAMILY.JSON')).toBe('json')
  })
})

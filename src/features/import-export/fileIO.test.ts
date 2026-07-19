import { describe, expect, it } from 'vitest'
import { formatExportTimestamp } from './fileIO'

describe('formatExportTimestamp', () => {
  it('固定日時を14桁のyyyyMMddHHmmss形式へ書式化する', () => {
    expect(formatExportTimestamp(new Date(2026, 6, 18, 14, 30, 22))).toBe('20260718143022')
  })

  it('月日時分秒が1桁の場合はゼロ埋めする', () => {
    expect(formatExportTimestamp(new Date(2026, 0, 1, 0, 0, 5))).toBe('20260101000005')
  })
})

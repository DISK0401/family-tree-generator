import { describe, expect, it } from 'vitest'
import { gregorianToJapanese } from './toWareki'

describe('gregorianToJapanese', () => {
  it('1989-01-07を昭和64年1月7日に変換する', () => {
    const result = gregorianToJapanese({ year: 1989, month: 1, day: 7 })

    expect(result).toEqual({
      success: true,
      value: { era: '昭和', year: 64, month: 1, day: 7 },
    })
  })

  it('1989-01-08を平成元年1月8日に変換する', () => {
    const result = gregorianToJapanese({ year: 1989, month: 1, day: 8 })

    expect(result).toEqual({
      success: true,
      value: { era: '平成', year: 1, month: 1, day: 8 },
    })
  })

  it('改元をまたがない年のみの変換は一意に決まる', () => {
    const result = gregorianToJapanese({ year: 1990 })

    expect(result).toEqual({ success: true, value: { era: '平成', year: 2 } })
  })

  it('改元をまたぐ年は月日なしでは変換失敗を返す', () => {
    const result = gregorianToJapanese({ year: 1989 })

    expect(result.success).toBe(false)
  })

  it('元号テーブルの範囲外の年は変換失敗を返す', () => {
    const result = gregorianToJapanese({ year: 1500 })

    expect(result.success).toBe(false)
  })
})

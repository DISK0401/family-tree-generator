import { describe, expect, it } from 'vitest'
import { japaneseToGregorian } from './toGregorian'

describe('japaneseToGregorian', () => {
  it('昭和64年1月7日を1989-01-07に変換する', () => {
    const result = japaneseToGregorian({
      era: '昭和',
      year: 64,
      month: 1,
      day: 7,
    })

    expect(result).toEqual({
      success: true,
      value: { year: 1989, month: 1, day: 7 },
    })
  })

  it('元年(元号年=1)を正しく変換する', () => {
    const result = japaneseToGregorian({ era: '平成', year: 1 })

    expect(result).toEqual({ success: true, value: { year: 1989 } })
  })

  it('範囲外の元号は変換失敗を返す', () => {
    const result = japaneseToGregorian({ era: '應永', year: 3 })

    expect(result.success).toBe(false)
  })

  it('元号の範囲を超える年は変換失敗を返す', () => {
    const result = japaneseToGregorian({ era: '昭和', year: 65 })

    expect(result.success).toBe(false)
  })

  it('改元前(元年より前)の月日は変換失敗を返す', () => {
    // 平成は1989年1月8日開始のため、平成元年1月7日は存在しない
    const result = japaneseToGregorian({
      era: '平成',
      year: 1,
      month: 1,
      day: 7,
    })

    expect(result.success).toBe(false)
  })
})

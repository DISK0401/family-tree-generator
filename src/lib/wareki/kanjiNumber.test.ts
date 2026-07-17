import { describe, expect, it } from 'vitest'
import { kanjiToInt } from './kanjiNumber'

describe('kanjiToInt', () => {
  it.each([
    ['元', 1],
    ['一', 1],
    ['九', 9],
    ['十', 10],
    ['十一', 11],
    ['十七', 17],
    ['二十', 20],
    ['二十三', 23],
    ['六十四', 64],
    ['九十九', 99],
  ])('%s -> %i', (input, expected) => {
    expect(kanjiToInt(input)).toBe(expected)
  })

  it('数字として解釈できない文字列はundefinedを返す', () => {
    expect(kanjiToInt('あいう')).toBeUndefined()
    expect(kanjiToInt('十十')).toBeUndefined()
  })
})

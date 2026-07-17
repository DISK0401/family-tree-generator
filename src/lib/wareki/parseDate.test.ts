import { describe, expect, it } from 'vitest'
import { parseDateString } from './parseDate'

describe('parseDateString', () => {
  it('和暦の不完全日付「明治十年頃」を構造化しつつ原文を保持する', () => {
    const date = parseDateString('明治十年頃')

    expect(date).toEqual({
      original: '明治十年頃',
      calendar: 'japanese',
      era: '明治',
      year: 10,
      qualifier: 'about',
    })
  })

  it('アラビア数字混じりの和暦フル日付を構造化する', () => {
    const date = parseDateString('昭和64年1月7日')

    expect(date).toMatchObject({
      original: '昭和64年1月7日',
      calendar: 'japanese',
      era: '昭和',
      year: 64,
      month: 1,
      day: 7,
    })
  })

  it('元年表記を年=1として構造化する', () => {
    const date = parseDateString('平成元年1月8日')

    expect(date).toMatchObject({
      calendar: 'japanese',
      era: '平成',
      year: 1,
      month: 1,
      day: 8,
    })
  })

  it('年のみの西暦(1923)を構造化する', () => {
    const date = parseDateString('1923')

    expect(date).toEqual({
      original: '1923',
      calendar: 'gregorian',
      year: 1923,
    })
  })

  it('ISO形式の西暦フル日付を構造化する', () => {
    const date = parseDateString('1923-01-07')

    expect(date).toMatchObject({
      calendar: 'gregorian',
      year: 1923,
      month: 1,
      day: 7,
    })
  })

  it('構造化できない日付原文(戌年生まれ)を失わずに保持する', () => {
    const date = parseDateString('戌年生まれ')

    expect(date).toEqual({ original: '戌年生まれ' })
  })
})

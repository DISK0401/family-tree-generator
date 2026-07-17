import { describe, expect, it } from 'vitest'
import { isUnstructuredDate, lifeDateSchema } from './date'

describe('lifeDateSchema', () => {
  it('構造化された和暦の不完全日付(明治十年頃)を保持できる', () => {
    const date = lifeDateSchema.parse({
      original: '明治十年頃',
      calendar: 'japanese',
      era: '明治',
      year: 10,
      qualifier: 'about',
    })

    expect(date.original).toBe('明治十年頃')
    expect(date.calendar).toBe('japanese')
    expect(date.era).toBe('明治')
    expect(date.year).toBe(10)
    expect(date.qualifier).toBe('about')
    expect(date.month).toBeUndefined()
    expect(date.day).toBeUndefined()
  })

  it('年のみの日付を保持できる', () => {
    const date = lifeDateSchema.parse({
      original: '1923',
      calendar: 'gregorian',
      year: 1923,
    })

    expect(date.year).toBe(1923)
    expect(date.month).toBeUndefined()
  })

  it('構造化できない日付原文を失わずに保持する', () => {
    const date = lifeDateSchema.parse({ original: '戌年生まれ' })

    expect(date.original).toBe('戌年生まれ')
    expect(isUnstructuredDate(date)).toBe(true)
  })

  it('構造化された日付はisUnstructuredDateがfalseになる', () => {
    const date = lifeDateSchema.parse({
      original: '1923',
      calendar: 'gregorian',
      year: 1923,
    })

    expect(isUnstructuredDate(date)).toBe(false)
  })
})

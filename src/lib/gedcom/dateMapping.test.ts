import { describe, expect, it } from 'vitest'
import type { FuzzyDate } from '../../domain/types'
import { fuzzyDateToGedcomNode, gedcomNodeToFuzzyDate } from './dateMapping'

describe('fuzzyDateToGedcomNode', () => {
  it('構造化日付を7.0ではDATE値+PHRASEで出力する', () => {
    const date: FuzzyDate = {
      original: '1900年1月7日',
      qualifier: 'exact',
      date: { year: 1900, month: 1, day: 7 },
    }
    const { dateNode, siblingNodes } = fuzzyDateToGedcomNode(date, '7.0')

    expect(dateNode).toEqual({
      tag: 'DATE',
      value: '7 JAN 1900',
      children: [{ tag: 'PHRASE', value: '1900年1月7日', children: [] }],
    })
    expect(siblingNodes).toHaveLength(0)
  })

  it('aboutをABT修飾子として出力する', () => {
    const date: FuzzyDate = {
      original: '明治10年頃',
      qualifier: 'about',
      date: { year: 1877 },
    }
    const { dateNode } = fuzzyDateToGedcomNode(date, '7.0')

    expect(dateNode.value).toBe('ABT 1877')
  })

  it('betweenをBET...AND形式で出力する', () => {
    const date: FuzzyDate = {
      original: '1900〜1905',
      qualifier: 'between',
      date: { year: 1900 },
      date2: { year: 1905 },
    }
    const { dateNode } = fuzzyDateToGedcomNode(date, '7.0')

    expect(dateNode.value).toBe('BET 1900 AND 1905')
  })

  it('構造化できない日付は7.0でPHRASEのみのDATEになる', () => {
    const date: FuzzyDate = { original: '不明な日付表現', qualifier: 'exact' }
    const { dateNode } = fuzzyDateToGedcomNode(date, '7.0')

    expect(dateNode.value).toBeUndefined()
    expect(dateNode.children).toEqual([
      { tag: 'PHRASE', value: '不明な日付表現', children: [] },
    ])
  })

  it('5.5.1では構造化DATE値+NOTE(原文)で出力する', () => {
    const date: FuzzyDate = {
      original: '明治10年頃',
      qualifier: 'about',
      date: { year: 1877 },
    }
    const { dateNode, siblingNodes } = fuzzyDateToGedcomNode(date, '5.5.1')

    expect(dateNode.value).toBe('ABT 1877')
    expect(siblingNodes).toEqual([
      { tag: 'NOTE', value: '元の表記: 明治10年頃', children: [] },
    ])
  })

  it('構造化できない日付は5.5.1で丸括弧の日付句になる', () => {
    const date: FuzzyDate = { original: '不明な日付表現', qualifier: 'exact' }
    const { dateNode } = fuzzyDateToGedcomNode(date, '5.5.1')

    expect(dateNode.value).toBe('(不明な日付表現)')
  })
})

describe('gedcomNodeToFuzzyDate', () => {
  it('構造化DATE値をgregorianとして解釈する', () => {
    const date = gedcomNodeToFuzzyDate({
      tag: 'DATE',
      value: '7 JAN 1900',
      children: [],
    })
    expect(date).toMatchObject({
      qualifier: 'exact',
      date: { year: 1900, month: 1, day: 7 },
    })
  })

  it('ABT修飾子をqualifierに変換する', () => {
    const date = gedcomNodeToFuzzyDate({
      tag: 'DATE',
      value: 'ABT 1877',
      children: [],
    })
    expect(date.qualifier).toBe('about')
    expect(date.date).toEqual({ year: 1877, month: undefined, day: undefined })
  })

  it('BET...ANDをbetween+date2に変換する', () => {
    const date = gedcomNodeToFuzzyDate({
      tag: 'DATE',
      value: 'BET 1900 AND 1905',
      children: [],
    })
    expect(date.qualifier).toBe('between')
    expect(date.date?.year).toBe(1900)
    expect(date.date2?.year).toBe(1905)
  })

  it('PHRASEがある場合は原文としてPHRASE値を優先する', () => {
    const date = gedcomNodeToFuzzyDate({
      tag: 'DATE',
      value: 'ABT 1877',
      children: [{ tag: 'PHRASE', value: '明治10年頃', children: [] }],
    })
    expect(date.original).toBe('明治10年頃')
  })

  it('丸括弧の日付句を原文として解釈する', () => {
    const date = gedcomNodeToFuzzyDate({
      tag: 'DATE',
      value: '(不明な日付表現)',
      children: [],
    })
    expect(date).toEqual({ original: '不明な日付表現', qualifier: 'exact' })
  })
})

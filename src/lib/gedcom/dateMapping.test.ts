import { describe, expect, it } from 'vitest'
import { parseDateString } from '../wareki/parseDate'
import { gedcomDateNodeToLifeDate, lifeDateToGedcomNode } from './dateMapping'

describe('lifeDateToGedcomNode', () => {
  it('西暦フル日付をGEDCOM形式に変換する', () => {
    const date = parseDateString('1900-01-07')
    const result = lifeDateToGedcomNode(date, '7.0')

    expect(result.dateNode).toEqual({
      tag: 'DATE',
      value: '7 JAN 1900',
      children: [],
    })
    expect(result.siblingNodes).toHaveLength(0)
  })

  it('和暦(頃修飾語付き)を7.0ではDATE+PHRASEで出力する', () => {
    const date = parseDateString('明治十年頃')
    const result = lifeDateToGedcomNode(date, '7.0')

    expect(result.dateNode.tag).toBe('DATE')
    expect(result.dateNode.value).toBe('ABT 1877')
    expect(result.dateNode.children).toEqual([
      { tag: 'PHRASE', value: '明治十年頃', children: [] },
    ])
  })

  it('和暦を5.5.1ではDATE(構造化値)+NOTE(原文)で出力する', () => {
    const date = parseDateString('明治十年頃')
    const result = lifeDateToGedcomNode(date, '5.5.1')

    expect(result.dateNode.value).toBe('ABT 1877')
    expect(result.siblingNodes).toEqual([
      { tag: 'NOTE', value: '元の表記: 明治十年頃', children: [] },
    ])
  })

  it('構造化できない日付は7.0でPHRASEのみのDATEになる', () => {
    const date = parseDateString('戌年生まれ')
    const result = lifeDateToGedcomNode(date, '7.0')

    expect(result.dateNode.value).toBeUndefined()
    expect(result.dateNode.children).toEqual([
      { tag: 'PHRASE', value: '戌年生まれ', children: [] },
    ])
  })

  it('構造化できない日付は5.5.1で丸括弧の日付句になる', () => {
    const date = parseDateString('戌年生まれ')
    const result = lifeDateToGedcomNode(date, '5.5.1')

    expect(result.dateNode.value).toBe('(戌年生まれ)')
  })
})

describe('gedcomDateNodeToLifeDate', () => {
  it('構造化DATE値をgregorianとして解釈する', () => {
    const date = gedcomDateNodeToLifeDate({
      tag: 'DATE',
      value: '7 JAN 1900',
      children: [],
    })

    expect(date).toMatchObject({
      calendar: 'gregorian',
      year: 1900,
      month: 1,
      day: 7,
    })
  })

  it('ABT修飾子をqualifierに変換する', () => {
    const date = gedcomDateNodeToLifeDate({
      tag: 'DATE',
      value: 'ABT 1877',
      children: [],
    })

    expect(date.qualifier).toBe('about')
    expect(date.year).toBe(1877)
  })

  it('PHRASEがある場合は原文としてPHRASE値を優先する', () => {
    const date = gedcomDateNodeToLifeDate({
      tag: 'DATE',
      value: 'ABT 1877',
      children: [{ tag: 'PHRASE', value: '明治十年頃', children: [] }],
    })

    expect(date.original).toBe('明治十年頃')
  })

  it('丸括弧の日付句を原文として解釈する', () => {
    const date = gedcomDateNodeToLifeDate({
      tag: 'DATE',
      value: '(戌年生まれ)',
      children: [],
    })

    expect(date).toEqual({ original: '戌年生まれ' })
  })
})

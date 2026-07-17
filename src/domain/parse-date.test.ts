import { describe, expect, it } from 'vitest'
import { parseDateInput } from './parse-date'

function expectOk(input: string) {
  const r = parseDateInput(input)
  expect(r.ok, `${input} が失敗: ${!r.ok ? r.message : ''}`).toBe(true)
  if (!r.ok) throw new Error('unreachable')
  return r.value
}

describe('parseDateInput: 和暦', () => {
  it('昭和39年10月10日', () => {
    expect(expectOk('昭和39年10月10日')).toEqual({
      original: '昭和39年10月10日',
      qualifier: 'exact',
      date: { year: 1964, month: 10, day: 10 },
    })
  })

  it('令和元年5月1日(元年表記)', () => {
    expect(expectOk('令和元年5月1日').date).toEqual({ year: 2019, month: 5, day: 1 })
  })

  it('平成5年(年のみ)・全角数字', () => {
    expect(expectOk('平成5年').date).toEqual({ year: 1993 })
    expect(expectOk('平成５年').date).toEqual({ year: 1993 })
  })
})

describe('parseDateInput: 西暦', () => {
  it.each([
    ['1964年10月10日', { year: 1964, month: 10, day: 10 }],
    ['1964-10-10', { year: 1964, month: 10, day: 10 }],
    ['1964/10/10', { year: 1964, month: 10, day: 10 }],
    ['1964年', { year: 1964 }],
    ['1964', { year: 1964 }],
    ['1988', { year: 1988 }],
  ])('%s', (input, expected) => {
    expect(expectOk(input).date).toEqual(expected)
  })
})

describe('parseDateInput: 修飾子', () => {
  it('「昭和10年頃」→ about', () => {
    const v = expectOk('昭和10年頃')
    expect(v.qualifier).toBe('about')
    expect(v.date).toEqual({ year: 1935 })
    expect(v.original).toBe('昭和10年頃')
  })

  it('「1900年以前」→ before、「明治33年以降」→ after', () => {
    expect(expectOk('1900年以前').qualifier).toBe('before')
    expect(expectOk('明治33年以降').qualifier).toBe('after')
  })

  it('「1960年〜1965年」→ between', () => {
    const v = expectOk('1960年〜1965年')
    expect(v.qualifier).toBe('between')
    expect(v.date).toEqual({ year: 1960 })
    expect(v.date2).toEqual({ year: 1965 })
  })
})

describe('parseDateInput: エラー', () => {
  it('昭和65年はエラー(昭和は64年まで)', () => {
    const r = parseDateInput('昭和65年1月1日')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('昭和は64年まで')
  })

  it('存在しない暦日・読み取れない文字列・空文字', () => {
    expect(parseDateInput('2000年2月30日').ok).toBe(false)
    expect(parseDateInput('生年不詳').ok).toBe(false)
    expect(parseDateInput('  ').ok).toBe(false)
  })
})

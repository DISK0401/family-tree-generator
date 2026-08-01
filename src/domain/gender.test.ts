import { describe, expect, it } from 'vitest'
import { formatGender, parseGenderInput } from './gender'

describe('parseGenderInput: 性別セルの解釈(spec「日付セル・性別セルの解釈」)', () => {
  it('日本語・略記・英語の各表記を受理する', () => {
    expect(parseGenderInput('男')).toBe('male')
    expect(parseGenderInput('男性')).toBe('male')
    expect(parseGenderInput('女')).toBe('female')
    expect(parseGenderInput('女性')).toBe('female')
    expect(parseGenderInput('不明')).toBe('unknown')
    expect(parseGenderInput('M')).toBe('male')
    expect(parseGenderInput('f')).toBe('female')
    expect(parseGenderInput('U')).toBe('unknown')
    expect(parseGenderInput('male')).toBe('male')
    expect(parseGenderInput('FEMALE')).toBe('female')
    expect(parseGenderInput('unknown')).toBe('unknown')
  })

  it('前後の空白を無視する', () => {
    expect(parseGenderInput('  男 ')).toBe('male')
  })

  it('空文字は「不明」として受理する(空セルのペースト=不明で上書き)', () => {
    expect(parseGenderInput('')).toBe('unknown')
    expect(parseGenderInput('   ')).toBe('unknown')
  })

  it('解釈できない表記はundefinedを返す', () => {
    expect(parseGenderInput('おとこ')).toBeUndefined()
    expect(parseGenderInput('man')).toBeUndefined()
    expect(parseGenderInput('1')).toBeUndefined()
  })
})

describe('formatGender: 表示表記', () => {
  it('parseGenderInputと往復できる', () => {
    for (const gender of ['male', 'female', 'unknown'] as const) {
      expect(parseGenderInput(formatGender(gender))).toBe(gender)
    }
  })
})

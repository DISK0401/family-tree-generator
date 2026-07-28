import { describe, expect, it } from 'vitest'
import { pedigreeToPedi, pediToPedigree } from './pedigree'

describe('pedigreeToPedi', () => {
  it('7.0では大文字のPEDI値を出力する', () => {
    expect(pedigreeToPedi('adopted', '7.0')).toEqual({ value: 'ADOPTED' })
  })

  it('5.5.1では小文字のPEDI値を出力する', () => {
    expect(pedigreeToPedi('adopted', '5.5.1')).toEqual({ value: 'adopted' })
  })

  it('unknownは5.5.1ではPEDIタグ自体を省略する(規格外値unknownを出力しない)', () => {
    expect(pedigreeToPedi('unknown', '5.5.1')).toBeUndefined()
  })

  it('unknownは7.0では規格内のOTHER+PHRASE補足で出力する', () => {
    expect(pedigreeToPedi('unknown', '7.0')).toEqual({
      value: 'OTHER',
      phrase: '続柄不明',
    })
  })
})

describe('pediToPedigree', () => {
  it('PEDIなしは実子として扱う(他ツールの慣行)', () => {
    expect(pediToPedigree(undefined)).toBe('biological')
  })

  it('adoptedを養子として解釈する(大小文字を問わない)', () => {
    expect(pediToPedigree('adopted')).toBe('adopted')
    expect(pediToPedigree('ADOPTED')).toBe('adopted')
  })

  it('OTHERはPHRASEの有無を問わず「不明」として解釈する', () => {
    expect(pediToPedigree('OTHER')).toBe('unknown')
    expect(pediToPedigree('other')).toBe('unknown')
  })

  it('旧バージョンの本アプリが出力していたUNKNOWNも「不明」として解釈する', () => {
    expect(pediToPedigree('unknown')).toBe('unknown')
    expect(pediToPedigree('UNKNOWN')).toBe('unknown')
  })

  it('SEALING・未知の値はunknownとして解釈する', () => {
    expect(pediToPedigree('SEALING')).toBe('unknown')
    expect(pediToPedigree('some-other-value')).toBe('unknown')
  })
})

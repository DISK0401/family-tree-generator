import { describe, expect, it } from 'vitest'
import { pedigreeToPedi, pediToPedigree } from './pedigree'

describe('pedigreeToPedi', () => {
  it('7.0では大文字のPEDI値を出力する', () => {
    expect(pedigreeToPedi('adopted', '7.0')).toBe('ADOPTED')
  })

  it('5.5.1では小文字のPEDI値を出力する', () => {
    expect(pedigreeToPedi('adopted', '5.5.1')).toBe('adopted')
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

  it('未知の値はunknownとして解釈する', () => {
    expect(pediToPedigree('some-other-value')).toBe('unknown')
  })
})

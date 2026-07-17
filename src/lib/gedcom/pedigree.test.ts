import { describe, expect, it } from 'vitest'
import { childPedigreeToPedi, pediToChildPedigree } from './pedigree'

describe('childPedigreeToPedi', () => {
  it('7.0では大文字のPEDI値を出力する', () => {
    expect(childPedigreeToPedi('adopted', '7.0')).toBe('ADOPTED')
  })

  it('5.5.1では小文字のPEDI値を出力する', () => {
    expect(childPedigreeToPedi('adopted', '5.5.1')).toBe('adopted')
  })
})

describe('pediToChildPedigree', () => {
  it('PEDIなしは実子として扱う', () => {
    expect(pediToChildPedigree(undefined)).toEqual({
      pedigree: 'biological',
      unrecognized: false,
    })
  })

  it('adoptedを養子として解釈する(大小文字を問わない)', () => {
    expect(pediToChildPedigree('adopted')).toEqual({
      pedigree: 'adopted',
      unrecognized: false,
    })
    expect(pediToChildPedigree('ADOPTED')).toEqual({
      pedigree: 'adopted',
      unrecognized: false,
    })
  })

  it('未知の値は実子扱いにしつつ未認識フラグを立てる', () => {
    expect(pediToChildPedigree('unknown-value')).toEqual({
      pedigree: 'biological',
      unrecognized: true,
    })
  })
})

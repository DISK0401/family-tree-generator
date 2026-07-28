import { describe, expect, it } from 'vitest'
import { pedigreeToPedi, pediToPedigree } from './pedigree'

describe('pedigreeToPedi', () => {
  it('7.0では大文字のPEDI値を出力する', () => {
    expect(pedigreeToPedi('adopted', '7.0')).toEqual({ value: 'ADOPTED' })
  })

  it('5.5.1では小文字のPEDI値を出力する', () => {
    expect(pedigreeToPedi('adopted', '5.5.1')).toEqual({ value: 'adopted' })
  })

  it('stepは7.0ではOTHER+PHRASE 継子で出力する(unknownと判別可能)', () => {
    expect(pedigreeToPedi('step', '7.0')).toEqual({
      value: 'OTHER',
      phrase: '継子',
    })
  })

  it('stepは5.5.1では従来どおりotherを出力する(後方互換)', () => {
    expect(pedigreeToPedi('step', '5.5.1')).toEqual({ value: 'other' })
  })

  it('unknownは5.5.1ではPEDIタグ自体を省略する(規格外値unknownを出力しない)', () => {
    expect(pedigreeToPedi('unknown', '5.5.1')).toBeUndefined()
  })

  it('unknownは7.0では規格内のOTHER+PHRASE 続柄不明で出力する', () => {
    expect(pedigreeToPedi('unknown', '7.0')).toEqual({
      value: 'OTHER',
      phrase: '続柄不明',
    })
  })
})

describe('pediToPedigree', () => {
  it('PEDIなしは実子として扱う(他ツールの慣行)', () => {
    expect(pediToPedigree(undefined)).toEqual({
      pedigree: 'biological',
      unrecognizedOther: false,
    })
  })

  it('adoptedを養子として解釈する(大小文字を問わない)', () => {
    expect(pediToPedigree('adopted').pedigree).toBe('adopted')
    expect(pediToPedigree('ADOPTED').pedigree).toBe('adopted')
  })

  it('OTHER+PHRASE 継子はstepとして解釈する', () => {
    expect(pediToPedigree('OTHER', '継子')).toEqual({
      pedigree: 'step',
      unrecognizedOther: false,
    })
  })

  it('OTHER+PHRASE 続柄不明はunknownとして解釈する', () => {
    expect(pediToPedigree('OTHER', '続柄不明')).toEqual({
      pedigree: 'unknown',
      unrecognizedOther: false,
    })
  })

  it('PHRASEなし・判別できないPHRASEのOTHERはunknownへ丸めてフラグを立てる', () => {
    expect(pediToPedigree('OTHER')).toEqual({
      pedigree: 'unknown',
      unrecognizedOther: true,
    })
    expect(pediToPedigree('other')).toEqual({
      pedigree: 'unknown',
      unrecognizedOther: true,
    })
    expect(pediToPedigree('OTHER', '不明な補足')).toEqual({
      pedigree: 'unknown',
      unrecognizedOther: true,
    })
  })

  it('旧バージョンの本アプリが出力していたUNKNOWNも「不明」として解釈する', () => {
    expect(pediToPedigree('unknown')).toEqual({
      pedigree: 'unknown',
      unrecognizedOther: false,
    })
    expect(pediToPedigree('UNKNOWN')).toEqual({
      pedigree: 'unknown',
      unrecognizedOther: false,
    })
  })

  it('SEALING・未知の値はunknownとして解釈する', () => {
    expect(pediToPedigree('SEALING').pedigree).toBe('unknown')
    expect(pediToPedigree('some-other-value').pedigree).toBe('unknown')
  })
})

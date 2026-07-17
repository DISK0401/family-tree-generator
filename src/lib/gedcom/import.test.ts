import { describe, expect, it } from 'vitest'
import { importGedcom } from './import'

function bytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

describe('importGedcom GEDCOM 7.0ファイルのインポート', () => {
  it('バージョンを自動判定し人物・家族をTreeDocumentへ変換する', () => {
    const text = [
      '0 HEAD',
      '1 GEDC',
      '2 VERS 7.0',
      '0 @I1@ INDI',
      '1 NAME 太郎 /山田/',
      '2 GIVN 太郎',
      '2 SURN 山田',
      '1 SEX M',
      '1 BIRT',
      '2 DATE 7 JAN 1900',
      '0 @I2@ INDI',
      '1 NAME 花子 /山田/',
      '1 SEX F',
      '0 @F1@ FAM',
      '1 HUSB @I1@',
      '1 WIFE @I2@',
      '1 MARR',
      '0 TRLR',
    ].join('\n')

    const result = importGedcom(bytesOf(text))

    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.version).toBe('7.0')
    expect(Object.keys(result.document.persons)).toHaveLength(2)
    expect(Object.keys(result.document.families)).toHaveLength(1)

    const family = Object.values(result.document.families)[0]
    expect(family.spouseIds).toHaveLength(2)
    expect(family.kind).toBe('married')

    const taro = Object.values(result.document.persons).find(
      (p) => p.name.given === '太郎',
    )
    expect(taro?.gender).toBe('male')
    expect(taro?.birth?.date?.date).toEqual({ year: 1900, month: 1, day: 7 })
  })
})

describe('importGedcom GEDCOM 5.5.1ファイルのインポート', () => {
  it('拡張タグ_KANA_SURN/_KANA_GIVNから読み仮名をTreeDocumentへ変換する', () => {
    const text = [
      '0 HEAD',
      '1 GEDC',
      '2 VERS 5.5.1',
      '1 CHAR UTF-8',
      '0 @I1@ INDI',
      '1 NAME 太郎 /山田/',
      '2 SURN 山田',
      '2 GIVN 太郎',
      '2 _KANA_SURN やまだ',
      '2 _KANA_GIVN たろう',
      '0 TRLR',
    ].join('\n')

    const result = importGedcom(bytesOf(text))

    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.version).toBe('5.5.1')
    const person = Object.values(result.document.persons)[0]
    expect(person.name.surnameKana).toBe('やまだ')
    expect(person.name.givenKana).toBe('たろう')
  })
})

describe('importGedcom GEDCOMとして解釈できないファイル', () => {
  it('HEADが見つからない場合はインポートを中断する', () => {
    const text = ['this is not gedcom at all', 'just plain text'].join('\n')

    const result = importGedcom(bytesOf(text))

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.reason).toContain('HEAD')
  })
})

describe('importGedcom 養子縁組を含むファイルのインポート', () => {
  it('PEDI ADOPTEDを続柄「養子」に変換する', () => {
    const text = [
      '0 HEAD',
      '1 GEDC',
      '2 VERS 7.0',
      '0 @I1@ INDI',
      '1 NAME Child /Test/',
      '1 FAMC @F1@',
      '2 PEDI ADOPTED',
      '0 @I2@ INDI',
      '1 NAME Parent /Test/',
      '0 @F1@ FAM',
      '1 HUSB @I2@',
      '1 CHIL @I1@',
      '0 TRLR',
    ].join('\n')

    const result = importGedcom(bytesOf(text))

    expect(result.success).toBe(true)
    if (!result.success) return

    const family = Object.values(result.document.families)[0]
    expect(family.children[0].pedigree).toBe('adopted')
  })
})

describe('importGedcom ANUL(婚姻取消)の取り込み', () => {
  it('ANULを離婚イベントとして取り込み警告を出す', () => {
    const text = [
      '0 HEAD',
      '1 GEDC',
      '2 VERS 7.0',
      '0 @I1@ INDI',
      '1 NAME A /Test/',
      '0 @I2@ INDI',
      '1 NAME B /Test/',
      '0 @F1@ FAM',
      '1 HUSB @I1@',
      '1 WIFE @I2@',
      '1 ANUL',
      '0 TRLR',
    ].join('\n')

    const result = importGedcom(bytesOf(text))

    expect(result.success).toBe(true)
    if (!result.success) return

    const family = Object.values(result.document.families)[0]
    expect(family.events).toEqual([
      { type: 'divorce', date: undefined, place: undefined },
    ])
    expect(result.warnings.some((w) => w.tag === 'ANUL')).toBe(true)
  })
})

describe('importGedcom 警告付きインポートの成立', () => {
  it('解釈できない行があってもインポート自体は成立し警告に含まれる', () => {
    const text = [
      '0 HEAD',
      '1 GEDC',
      '2 VERS 7.0',
      '0 @I1@ INDI',
      '1 NAME Only /Person/',
      'this line is not valid gedcom syntax',
      '0 TRLR',
    ].join('\n')

    const result = importGedcom(bytesOf(text))

    expect(result.success).toBe(true)
    if (!result.success) return

    expect(Object.keys(result.document.persons)).toHaveLength(1)
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it('存在しない人物を子として参照する場合は警告を出す', () => {
    const text = [
      '0 HEAD',
      '1 GEDC',
      '2 VERS 7.0',
      '0 @I1@ INDI',
      '1 NAME Parent /Test/',
      '0 @F1@ FAM',
      '1 HUSB @I1@',
      '1 CHIL @I999@',
      '0 TRLR',
    ].join('\n')

    const result = importGedcom(bytesOf(text))

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.warnings.some((w) => w.tag === 'CHIL')).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import { importGedcom } from './import'

function bytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

describe('相互運用フィクスチャテスト(他サービス出力を模したファイル)', () => {
  it('MyHeritage風の5.5.1ファイル(ROMN・階層PLAC・CONC分割NOTE)を警告許容で取り込む', () => {
    const text = [
      '0 HEAD',
      '1 SOUR MYHERITAGE',
      '1 GEDC',
      '2 VERS 5.5.1',
      '1 CHAR UTF-8',
      '0 @I1@ INDI',
      '1 NAME Taro /Yamada/',
      '2 ROMN Taro Yamada',
      '1 SEX M',
      '1 BIRT',
      '2 DATE 7 JAN 1900',
      '2 PLAC Tokyo, Tokyo, Japan',
      '1 NOTE This is a long biographical',
      '2 CONC  note continued across lines',
      '0 @I2@ INDI',
      '1 NAME Hanako /Yamada/',
      '1 SEX F',
      '0 @F1@ FAM',
      '1 HUSB @I1@',
      '1 WIF @I2@',
      '1 MARR',
      '0 TRLR',
    ].join('\n')

    const result = importGedcom(bytesOf(text))

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.version).toBe('5.5.1')
    expect(result.data.people).toHaveLength(2)
    expect(result.data.families).toHaveLength(1)

    const taro = result.data.people.find((p) => p.name?.given === 'Taro')
    expect(taro?.name?.romanized).toBe('Taro Yamada')
    expect(taro?.birth?.place).toBe('Tokyo, Tokyo, Japan')
    expect(taro?.note).toBe(
      'This is a long biographical note continued across lines',
    )
  })

  it('Gramps風の5.5.1ファイル(_UID・ADDR・OBJEを含む)を警告許容で取り込む', () => {
    const text = [
      '0 HEAD',
      '1 SOUR Gramps',
      '1 GEDC',
      '2 VERS 5.5.1',
      '1 CHAR UTF-8',
      '0 @I1@ INDI',
      '1 NAME Ichiro /Sato/',
      '1 _UID 1234abcd5678',
      '1 ADDR',
      '2 CITY Osaka',
      '1 OBJE',
      '2 FILE photo.jpg',
      '2 FORM jpg',
      '0 TRLR',
    ].join('\n')

    const result = importGedcom(bytesOf(text))

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.people).toHaveLength(1)

    const person = result.data.people[0]
    expect(person.name?.given).toBe('Ichiro')
    // 非対応タグ(_UID/ADDR/OBJE)は保全領域に残る(データを失わない)
    const unmappedTagNames = person.unmappedTags?.map((tag) => tag.tag) ?? []
    expect(unmappedTagNames).toEqual(
      expect.arrayContaining(['_UID', 'ADDR', 'OBJE']),
    )
  })

  it('FamilySearch風の7.0ファイル(TRAN/PHRASE・SOUR引用を含む)を警告許容で取り込む', () => {
    const text = [
      '0 HEAD',
      '1 GEDC',
      '2 VERS 7.0',
      '1 SOUR FamilySearch',
      '0 @I1@ INDI',
      '1 NAME 次郎 /鈴木/',
      '2 TRAN じろう /すずき/',
      '3 LANG ja-Hira',
      '1 BIRT',
      '2 DATE ABT 1850',
      '3 PHRASE 嘉永三年頃',
      '1 SOUR @S1@',
      '2 PAGE p.12',
      '0 @S1@ SOUR',
      '1 TITL 戸籍謄本',
      '0 TRLR',
    ].join('\n')

    const result = importGedcom(bytesOf(text))

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.version).toBe('7.0')

    const person = result.data.people[0]
    expect(person.name?.kana).toEqual({ family: 'すずき', given: 'じろう' })
    expect(person.birth?.date?.original).toBe('嘉永三年頃')
    // SOURレコード(トップレベル)は非対応レコードとして警告付きで読み飛ばされる
    expect(
      result.warnings.some(
        (w) => w.tag === 'SOUR' || w.message.includes('SOUR'),
      ),
    ).toBe(true)
  })
})

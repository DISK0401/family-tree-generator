import { describe, expect, it } from 'vitest'
import { importGedcom } from './import'
// 実ファイル風フィクスチャ(vite/vitestの?rawインポートでテキストとして読み込む)
import myheritageFixture from './__fixtures__/myheritage-551.ged?raw'
import kakeizuchoFixture from './__fixtures__/kakeizucho-70.ged?raw'

function bytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

describe('相互運用フィクスチャテスト(他サービス出力を模したファイル)', () => {
  it('MyHeritage風の5.5.1ファイル(階層PLAC・CONC分割NOTE)を警告許容で取り込む', () => {
    const text = [
      '0 HEAD',
      '1 SOUR MYHERITAGE',
      '1 GEDC',
      '2 VERS 5.5.1',
      '1 CHAR UTF-8',
      '0 @I1@ INDI',
      '1 NAME Taro /Yamada/',
      '2 SURN Yamada',
      '2 GIVN Taro',
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
      '1 WIFE @I2@',
      '1 MARR',
      '0 TRLR',
    ].join('\n')

    const result = importGedcom(bytesOf(text))

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.version).toBe('5.5.1')
    expect(Object.keys(result.document.persons)).toHaveLength(2)
    expect(Object.keys(result.document.families)).toHaveLength(1)

    const taro = Object.values(result.document.persons).find(
      (p) => p.name.given === 'Taro',
    )
    expect(taro?.birth?.place).toBe('Tokyo, Tokyo, Japan')
    expect(taro?.note).toBe(
      'This is a long biographical note continued across lines',
    )

    // SURN/GIVNサブタグを持たないHanakoもNAME行値から姓名が補完される
    const hanako = Object.values(result.document.persons).find(
      (p) => p.name.given === 'Hanako',
    )
    expect(hanako).toBeDefined()
    expect(hanako?.name.surname).toBe('Yamada')
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
      '2 SURN Sato',
      '2 GIVN Ichiro',
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
    expect(Object.keys(result.document.persons)).toHaveLength(1)

    const person = Object.values(result.document.persons)[0]
    expect(person.name.given).toBe('Ichiro')

    // 未対応タグはレコード単位で集計して報告される
    const summary = result.warnings.find((w) =>
      w.message.includes('読み飛ばしました'),
    )
    expect(summary?.message).toContain('@I1@')
    expect(summary?.message).toContain('_UID')
    expect(summary?.message).toContain('3項目')
  })

  it('FamilySearch風の7.0ファイル(PHRASE・SOUR引用を含む)を警告許容で取り込む', () => {
    const text = [
      '0 HEAD',
      '1 GEDC',
      '2 VERS 7.0',
      '1 SOUR FamilySearch',
      '0 @I1@ INDI',
      '1 NAME 次郎 /鈴木/',
      '2 SURN 鈴木',
      '2 GIVN 次郎',
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

    const person = Object.values(result.document.persons)[0]
    expect(person.birth?.date?.original).toBe('嘉永三年頃')
    // SOURレコード(トップレベル)は非対応レコードとして警告付きで読み飛ばされる
    expect(
      result.warnings.some(
        (w) => w.tag === 'SOUR' || w.message.includes('SOUR'),
      ),
    ).toBe(true)
  })
})

describe('実ファイル風フィクスチャの取り込み', () => {
  it('MyHeritage風5.5.1ファイル(NAME値のみ・SOUR/SUBM入り)を取り込む', () => {
    const result = importGedcom(bytesOf(myheritageFixture))

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.version).toBe('5.5.1')
    expect(result.encoding).toBe('utf-8')
    expect(Object.keys(result.document.persons)).toHaveLength(3)
    expect(Object.keys(result.document.families)).toHaveLength(1)

    // SURN/GIVNサブタグなしのNAME行値から姓名が補完される
    const taro = Object.values(result.document.persons).find(
      (p) => p.name.given === '太郎',
    )
    expect(taro?.name.surname).toBe('山田')
    expect(taro?.birth?.place).toBe('東京府, 日本')
    expect(taro?.birth?.date?.date).toEqual({ year: 1900, month: 1, day: 7 })
    // CONC/CONTで分割されたNOTEが復元される
    expect(taro?.note).toBe(
      '長いメモの一行目です。この行はMyHeritage風にCONCで分割されています。\n二行目です。',
    )

    const family = Object.values(result.document.families)[0]
    expect(family.spouseIds).toHaveLength(2)
    expect(family.children).toHaveLength(1)
    expect(family.kind).toBe('married')

    // SUBMレコードは既知として警告なし、RIN等の未知タグは要約警告になる
    expect(result.warnings.some((w) => w.message.includes('SUBM'))).toBe(false)
    expect(
      result.warnings.some(
        (w) => w.message.includes('RIN') && w.message.includes('読み飛ばし'),
      ),
    ).toBe(true)
  })

  it('本アプリ風7.0ファイル(かな拡張・長文NOTE入り)を取り込む', () => {
    const result = importGedcom(bytesOf(kakeizuchoFixture))

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.version).toBe('7.0')
    expect(result.document.title).toBe('渡邊家の系譜')

    const person = Object.values(result.document.persons)[0]
    expect(person.name).toEqual({
      surname: '渡邊',
      given: '榮太郎',
      surnameKana: 'わたなべ',
      givenKana: 'えいたろう',
    })
    expect(person.birth?.date?.original).toBe('明治10年頃')
    expect(person.birth?.date?.date).toEqual({
      year: 1877,
      month: undefined,
      day: undefined,
    })
    expect(person.birth?.place).toBe('東京府豊多摩郡')
    // 200文字を超えるNOTEが1行のまま取り込まれる
    expect(person.note?.length).toBeGreaterThan(200)
    expect(person.note?.startsWith('榮太郎は明治十年頃に')).toBe(true)
  })
})

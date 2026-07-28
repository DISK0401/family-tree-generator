import { describe, expect, it } from 'vitest'
import { gedcomNodeToPersonName, personNameToGedcomNode } from './nameMapping'
import { findChild } from './nodeHelpers'

describe('personNameToGedcomNode', () => {
  it('旧字体をそのまま出力し、SURN/GIVNサブ構造を持つ', () => {
    const node = personNameToGedcomNode(
      { surname: '齋藤', given: '太郎' },
      '7.0',
    )

    expect(node.tag).toBe('NAME')
    expect(node.value).toBe('太郎 /齋藤/')
    expect(findChild(node, 'SURN')?.value).toBe('齋藤')
    expect(findChild(node, 'GIVN')?.value).toBe('太郎')
  })

  it('ふりがなを拡張タグ_KANA_SURN/_KANA_GIVNで出力する', () => {
    const node = personNameToGedcomNode(
      {
        surname: '東海林',
        surnameKana: 'しょうじ',
        givenKana: 'たろう',
      },
      '7.0',
    )

    expect(findChild(node, '_KANA_SURN')?.value).toBe('しょうじ')
    expect(findChild(node, '_KANA_GIVN')?.value).toBe('たろう')
  })

  it('5.5.1ではふりがなを標準タグFONE(TYPE kana)でも併記する', () => {
    const node = personNameToGedcomNode(
      {
        surname: '山田',
        given: '太郎',
        surnameKana: 'やまだ',
        givenKana: 'たろう',
      },
      '5.5.1',
    )

    const fone = findChild(node, 'FONE')
    expect(fone?.value).toBe('たろう /やまだ/')
    expect(findChild(fone!, 'TYPE')?.value).toBe('kana')
    expect(findChild(node, 'TRAN')).toBeUndefined()
  })

  it('7.0ではふりがなを標準タグTRAN(LANG ja-Kana)でも併記する', () => {
    const node = personNameToGedcomNode(
      { surname: '山田', surnameKana: 'やまだ' },
      '7.0',
    )

    const tran = findChild(node, 'TRAN')
    expect(tran?.value).toBe('/やまだ/')
    expect(findChild(tran!, 'LANG')?.value).toBe('ja-Kana')
    expect(findChild(node, 'FONE')).toBeUndefined()
  })

  it('ふりがなが無い場合はFONE/TRANを出力しない', () => {
    const node = personNameToGedcomNode(
      { surname: '山田', given: '太郎' },
      '5.5.1',
    )

    expect(findChild(node, 'FONE')).toBeUndefined()
    expect(findChild(node, 'TRAN')).toBeUndefined()
  })
})

describe('gedcomNodeToPersonName', () => {
  it('SURN/GIVN/かな拡張タグからPersonNameを復元する', () => {
    const name = gedcomNodeToPersonName({
      tag: 'NAME',
      value: '太郎 /齋藤/',
      children: [
        { tag: 'SURN', value: '齋藤', children: [] },
        { tag: 'GIVN', value: '太郎', children: [] },
        { tag: '_KANA_SURN', value: 'さいとう', children: [] },
        { tag: '_KANA_GIVN', value: 'たろう', children: [] },
      ],
    })

    expect(name).toEqual({
      surname: '齋藤',
      given: '太郎',
      surnameKana: 'さいとう',
      givenKana: 'たろう',
    })
  })

  it('SURN/GIVNサブタグが無い場合はNAME行値から姓名を補完する', () => {
    const name = gedcomNodeToPersonName({
      tag: 'NAME',
      value: '花子 /山田/',
      children: [],
    })

    expect(name.given).toBe('花子')
    expect(name.surname).toBe('山田')
  })

  it('NAME行値が/姓/のみ・スラッシュなしの場合も解釈する', () => {
    expect(
      gedcomNodeToPersonName({ tag: 'NAME', value: '/山田/', children: [] }),
    ).toMatchObject({ surname: '山田', given: undefined })

    expect(
      gedcomNodeToPersonName({ tag: 'NAME', value: '太郎', children: [] }),
    ).toMatchObject({ surname: undefined, given: '太郎' })
  })

  it('NAME行値の後置suffixはgivenの末尾へ残す', () => {
    const name = gedcomNodeToPersonName({
      tag: 'NAME',
      value: 'John /Doe/ Jr.',
      children: [],
    })

    expect(name.surname).toBe('Doe')
    expect(name.given).toBe('John Jr.')
  })

  it('SURN/GIVNサブタグがある場合はNAME行値より優先する', () => {
    const name = gedcomNodeToPersonName({
      tag: 'NAME',
      value: '別名 /別姓/',
      children: [
        { tag: 'SURN', value: '山田', children: [] },
        { tag: 'GIVN', value: '太郎', children: [] },
      ],
    })

    expect(name.surname).toBe('山田')
    expect(name.given).toBe('太郎')
  })

  it('_KANA_*が無ければFONE(TYPE kana)からふりがなを補完する', () => {
    const name = gedcomNodeToPersonName({
      tag: 'NAME',
      value: '太郎 /山田/',
      children: [
        {
          tag: 'FONE',
          value: 'たろう /やまだ/',
          children: [{ tag: 'TYPE', value: 'kana', children: [] }],
        },
      ],
    })

    expect(name.surnameKana).toBe('やまだ')
    expect(name.givenKana).toBe('たろう')
  })

  it('_KANA_*が無ければTRAN(LANG ja-*)からふりがなを補完する', () => {
    const name = gedcomNodeToPersonName({
      tag: 'NAME',
      value: '太郎 /山田/',
      children: [
        {
          tag: 'TRAN',
          value: 'たろう /やまだ/',
          children: [{ tag: 'LANG', value: 'ja-Kana', children: [] }],
        },
      ],
    })

    expect(name.surnameKana).toBe('やまだ')
    expect(name.givenKana).toBe('たろう')
  })

  it('TYPEがかな系でないFONE(ローマ字等)はふりがなとして扱わない', () => {
    const name = gedcomNodeToPersonName({
      tag: 'NAME',
      value: '太郎 /山田/',
      children: [
        {
          tag: 'FONE',
          value: 'Taro /Yamada/',
          children: [{ tag: 'TYPE', value: 'romaji', children: [] }],
        },
      ],
    })

    expect(name.surnameKana).toBeUndefined()
    expect(name.givenKana).toBeUndefined()
  })

  it('_KANA_*があればFONEより優先する', () => {
    const name = gedcomNodeToPersonName({
      tag: 'NAME',
      value: '太郎 /山田/',
      children: [
        { tag: '_KANA_SURN', value: 'やまだ', children: [] },
        {
          tag: 'FONE',
          value: 'べつ /よみ/',
          children: [{ tag: 'TYPE', value: 'kana', children: [] }],
        },
      ],
    })

    expect(name.surnameKana).toBe('やまだ')
    expect(name.givenKana).toBeUndefined()
  })
})

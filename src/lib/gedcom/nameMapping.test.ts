import { describe, expect, it } from 'vitest'
import { gedcomNodeToPersonName, personNameToGedcomNode } from './nameMapping'
import { findChild } from './nodeHelpers'

describe('personNameToGedcomNode', () => {
  it('旧字体をそのまま出力し、SURN/GIVNサブ構造を持つ', () => {
    const node = personNameToGedcomNode({ surname: '齋藤', given: '太郎' })

    expect(node.tag).toBe('NAME')
    expect(node.value).toBe('太郎 /齋藤/')
    expect(findChild(node, 'SURN')?.value).toBe('齋藤')
    expect(findChild(node, 'GIVN')?.value).toBe('太郎')
  })

  it('ふりがなを拡張タグ_KANA_SURN/_KANA_GIVNで出力する', () => {
    const node = personNameToGedcomNode({
      surname: '東海林',
      surnameKana: 'しょうじ',
      givenKana: 'たろう',
    })

    expect(findChild(node, '_KANA_SURN')?.value).toBe('しょうじ')
    expect(findChild(node, '_KANA_GIVN')?.value).toBe('たろう')
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
})

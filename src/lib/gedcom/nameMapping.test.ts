import { describe, expect, it } from 'vitest'
import {
  gedcomNameNodesToPersonName,
  personNameToGedcomNodes,
} from './nameMapping'

describe('personNameToGedcomNodes', () => {
  it('旧字体をそのまま出力し、読み仮名は7.0でTRAN+LANGとして出力する', () => {
    const nodes = personNameToGedcomNodes(
      {
        family: '齋藤',
        given: '太郎',
        kana: { family: 'さいとう', given: 'たろう' },
      },
      '7.0',
    )

    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toMatchObject({ tag: 'NAME', value: '太郎 /齋藤/' })
    const tran = nodes[0].children.find((c) => c.tag === 'TRAN')
    expect(tran?.value).toBe('たろう /さいとう/')
    expect(tran?.children).toContainEqual({
      tag: 'LANG',
      value: 'ja-Hira',
      children: [],
    })
  })

  it('別表記(alternates)を追加のNAMEレコード(TYPE aka)として出力する', () => {
    const nodes = personNameToGedcomNodes(
      { family: '渡邊', alternates: [{ family: '渡辺' }] },
      '7.0',
    )

    expect(nodes).toHaveLength(2)
    expect(nodes[0].value).toBe('/渡邊/')
    expect(nodes[1].value).toBe('/渡辺/')
    expect(nodes[1].children).toContainEqual({
      tag: 'TYPE',
      value: 'aka',
      children: [],
    })
  })

  it('5.5.1では読み仮名を_KANA、ローマ字をROMNで出力する', () => {
    const nodes = personNameToGedcomNodes(
      {
        family: '東海林',
        kana: { family: 'しょうじ' },
        romanized: 'Shoji',
      },
      '5.5.1',
    )

    const kana = nodes[0].children.find((c) => c.tag === '_KANA')
    const romn = nodes[0].children.find((c) => c.tag === 'ROMN')
    expect(kana?.value).toBe('/しょうじ/')
    expect(romn?.value).toBe('Shoji')
  })
})

describe('gedcomNameNodesToPersonName', () => {
  it('NAME値から氏名と読み仮名を復元する(7.0)', () => {
    const name = gedcomNameNodesToPersonName(
      [
        {
          tag: 'NAME',
          value: '太郎 /齋藤/',
          children: [
            {
              tag: 'TRAN',
              value: 'たろう /さいとう/',
              children: [{ tag: 'LANG', value: 'ja-Hira', children: [] }],
            },
          ],
        },
      ],
      '7.0',
    )

    expect(name).toMatchObject({
      family: '齋藤',
      given: '太郎',
      kana: { family: 'さいとう', given: 'たろう' },
    })
  })

  it('複数NAMEレコードをalternatesとして復元する', () => {
    const name = gedcomNameNodesToPersonName(
      [
        { tag: 'NAME', value: '/渡邊/', children: [] },
        {
          tag: 'NAME',
          value: '/渡辺/',
          children: [{ tag: 'TYPE', value: 'aka', children: [] }],
        },
      ],
      '7.0',
    )

    expect(name?.family).toBe('渡邊')
    expect(name?.alternates).toHaveLength(1)
    expect(name?.alternates?.[0].family).toBe('渡辺')
  })

  it('5.5.1で_KANAタグから読み仮名を復元する', () => {
    const name = gedcomNameNodesToPersonName(
      [
        {
          tag: 'NAME',
          value: '太郎 /山田/',
          children: [{ tag: '_KANA', value: 'たろう /やまだ/', children: [] }],
        },
      ],
      '5.5.1',
    )

    expect(name?.kana).toEqual({ family: 'やまだ', given: 'たろう' })
  })

  it('5.5.1で_KANAが無い場合はROMNからも読み仮名を補完する', () => {
    const name = gedcomNameNodesToPersonName(
      [
        {
          tag: 'NAME',
          value: '太郎 /山田/',
          children: [{ tag: 'ROMN', value: 'Yamada Tarou', children: [] }],
        },
      ],
      '5.5.1',
    )

    expect(name?.romanized).toBe('Yamada Tarou')
    expect(name?.kana).toBeDefined()
  })
})

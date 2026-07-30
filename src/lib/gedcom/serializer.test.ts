import { describe, expect, it } from 'vitest'
import type { GedcomNode } from '../../domain/gedcomNode'
import { parseGedcomText } from './parser'
import { serializeGedcomTree } from './serializer'

function node(partial: Partial<GedcomNode> & { tag: string }): GedcomNode {
  return { children: [], ...partial }
}

function noteTree(value: string): GedcomNode[] {
  return [
    node({
      tag: 'INDI',
      children: [node({ tag: 'NOTE', value })],
    }),
  ]
}

describe('serializeGedcomTree', () => {
  it('level/xref/tag/valueを持つツリーをテキスト化する', () => {
    const tree: GedcomNode[] = [
      node({
        tag: 'INDI',
        xref: 'I1',
        children: [node({ tag: 'NAME', value: 'John /Doe/' })],
      }),
    ]

    const text = serializeGedcomTree(tree)

    expect(text).toBe('0 @I1@ INDI\n1 NAME John /Doe/\n')
  })

  it('改行を含む値をCONTで分割する', () => {
    const text = serializeGedcomTree(noteTree('first\nsecond'))

    expect(text).toBe('0 INDI\n1 NOTE first\n2 CONT second\n')
  })

  it('5.5.1では長いNOTE値をCONCで分割する', () => {
    const longValue = 'a'.repeat(250)
    const text = serializeGedcomTree(noteTree(longValue), '5.5.1')
    const lines = text.trim().split('\n')

    expect(lines).toHaveLength(3)
    expect(lines[0]).toBe(`0 INDI`)
    expect(lines[1]).toBe(`1 NOTE ${longValue.slice(0, 200)}`)
    expect(lines[2]).toBe(`2 CONC ${longValue.slice(200)}`)
  })

  it('7.0では200文字を超えるNOTEもCONC分割せず1行で出力する(CONTは維持)', () => {
    const longValue = `${'a'.repeat(250)}\n${'b'.repeat(250)}`
    const text = serializeGedcomTree(noteTree(longValue), '7.0')
    const lines = text.trim().split('\n')

    expect(lines).toEqual([
      '0 INDI',
      `1 NOTE ${'a'.repeat(250)}`,
      `2 CONT ${'b'.repeat(250)}`,
    ])
    expect(text).not.toContain('CONC')
  })

  it('5.5.1でもNOTE系以外のタグの200文字超はCONC分割せず1行で出力する', () => {
    const longPlace = 'x'.repeat(250)
    const tree: GedcomNode[] = [
      node({
        tag: 'INDI',
        children: [node({ tag: 'PLAC', value: longPlace })],
      }),
    ]

    const text = serializeGedcomTree(tree, '5.5.1')

    expect(text).toBe(`0 INDI\n1 PLAC ${longPlace}\n`)
  })

  it('サロゲートペア(𠮷)を境界で分断せず、UTF-8往復でU+FFFDが発生しない', () => {
    // 200文字目の境界がちょうど「𠮷」(サロゲートペア)の中間に当たる値
    const value = `${'あ'.repeat(199)}𠮷${'い'.repeat(50)}`
    const text = serializeGedcomTree(noteTree(value), '5.5.1')

    // TextEncoder/TextDecoderの往復(=ファイル書き出し・読み込み相当)で化けない
    const roundtripped = new TextDecoder().decode(
      new TextEncoder().encode(text),
    )
    expect(roundtripped).not.toContain('�')

    const { roots } = parseGedcomText(roundtripped)
    expect(roots[0].children[0].value).toBe(value)
  })

  it('CONC分割の境界がチャンク末尾の空白を避けて語中で切られる', () => {
    // 200文字目が空白になる値(空白直後で切ると行末空白トリム実装で失われる)
    const value = `${'a'.repeat(199)} ${'b'.repeat(100)}`
    const text = serializeGedcomTree(noteTree(value), '5.5.1')
    const lines = text.trim().split('\n')

    for (const line of lines) {
      expect(line).not.toMatch(/ $/)
    }
    // 分割されても値そのものは失われない
    const { roots } = parseGedcomText(text)
    expect(roots[0].children[0].value).toBe(value)
  })

  it('値の先頭の@を@@へエスケープし、ポインタ値はそのまま出力する', () => {
    const tree: GedcomNode[] = [
      node({
        tag: 'FAM',
        xref: 'F1',
        children: [
          node({ tag: 'HUSB', value: '@I1@' }),
          node({ tag: 'NOTE', value: '@メモの先頭がアットマーク' }),
        ],
      }),
    ]

    const text = serializeGedcomTree(tree)

    expect(text).toContain('1 HUSB @I1@')
    expect(text).toContain('1 NOTE @@メモの先頭がアットマーク')
  })

  it('値に含まれる\\r\\n・\\rを\\nへ正規化し、行構造を壊す注入を防ぐ', () => {
    const text = serializeGedcomTree(noteTree('abc\r0 @X@ INDI'))

    // \rが生の行区切りとして出力されず、CONT行として安全に表現される
    expect(text).toBe('0 INDI\n1 NOTE abc\n2 CONT 0 @X@ INDI\n')

    // 再パースしても偽のINDIレコードが生まれない
    const { roots } = parseGedcomText(text)
    expect(roots).toHaveLength(1)
    expect(roots[0].children[0].value).toBe('abc\n0 @X@ INDI')
  })
})

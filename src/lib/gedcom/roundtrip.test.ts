import { describe, expect, it } from 'vitest'
import type { GedcomNode } from '../../domain/gedcomNode'
import { parseGedcomText } from './parser'
import { serializeGedcomTree } from './serializer'

function stripLineNumbers(nodes: GedcomNode[]): unknown {
  return nodes.map((node) => {
    const clone: Record<string, unknown> = { ...node }
    delete clone.lineNumber
    clone.children = stripLineNumbers(node.children)
    return clone
  })
}

describe('GEDCOM構文層のラウンドトリップ', () => {
  it('parse -> serialize -> parse が等価な構造を保つ(改行・長文含む)', () => {
    const original = [
      '0 HEAD',
      '1 GEDC',
      '2 VERS 7.0',
      '0 @I1@ INDI',
      '1 NAME 齋藤/太郎/',
      '1 NOTE 複数行の',
      '2 CONT メモ内容です',
      '1 BIRT',
      '2 DATE 1 JAN 1900',
      '0 TRLR',
    ].join('\n')

    const firstPass = parseGedcomText(original)
    expect(firstPass.warnings).toHaveLength(0)

    const serialized = serializeGedcomTree(firstPass.roots)
    const secondPass = parseGedcomText(serialized)
    expect(secondPass.warnings).toHaveLength(0)

    expect(stripLineNumbers(secondPass.roots)).toEqual(
      stripLineNumbers(firstPass.roots),
    )
  })

  it('200文字を超える長い値もラウンドトリップで復元される', () => {
    const longNote = 'あ'.repeat(500)
    const original = ['0 @I1@ INDI', `1 NOTE ${longNote}`].join('\n')

    const firstPass = parseGedcomText(original)
    const serialized = serializeGedcomTree(firstPass.roots)
    const secondPass = parseGedcomText(serialized)

    expect(secondPass.roots[0].children[0].value).toBe(longNote)
  })
})

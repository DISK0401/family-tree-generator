import { describe, expect, it } from 'vitest'
import type { GedcomNode } from '../../domain/gedcomNode'
import { serializeGedcomTree } from './serializer'

function node(partial: Partial<GedcomNode> & { tag: string }): GedcomNode {
  return { children: [], ...partial }
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
    const tree: GedcomNode[] = [
      node({
        tag: 'INDI',
        children: [node({ tag: 'NOTE', value: 'first\nsecond' })],
      }),
    ]

    const text = serializeGedcomTree(tree)

    expect(text).toBe('0 INDI\n1 NOTE first\n2 CONT second\n')
  })

  it('長い値をCONCで分割する', () => {
    const longValue = 'a'.repeat(250)
    const tree: GedcomNode[] = [
      node({
        tag: 'INDI',
        children: [node({ tag: 'NOTE', value: longValue })],
      }),
    ]

    const text = serializeGedcomTree(tree)
    const lines = text.trim().split('\n')

    expect(lines).toHaveLength(3)
    expect(lines[0]).toBe(`0 INDI`)
    expect(lines[1]).toBe(`1 NOTE ${longValue.slice(0, 200)}`)
    expect(lines[2]).toBe(`2 CONC ${longValue.slice(200)}`)
  })
})

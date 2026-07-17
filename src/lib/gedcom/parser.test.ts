import { describe, expect, it } from 'vitest'
import { parseGedcomText } from './parser'

describe('parseGedcomText', () => {
  it('level/xref/tag/valueを解釈しツリーを構築する', () => {
    const text = [
      '0 HEAD',
      '1 GEDC',
      '2 VERS 7.0',
      '0 @I1@ INDI',
      '1 NAME John /Doe/',
      '1 BIRT',
      '2 DATE 1 JAN 1900',
      '0 TRLR',
    ].join('\n')

    const { roots, warnings } = parseGedcomText(text)

    expect(warnings).toHaveLength(0)
    expect(roots).toHaveLength(3)

    const [head, indi, trlr] = roots
    expect(head.tag).toBe('HEAD')
    expect(head.children[0]).toMatchObject({ tag: 'GEDC' })
    expect(head.children[0].children[0]).toMatchObject({
      tag: 'VERS',
      value: '7.0',
    })

    expect(indi.tag).toBe('INDI')
    expect(indi.xref).toBe('I1')
    expect(indi.children[0]).toMatchObject({
      tag: 'NAME',
      value: 'John /Doe/',
    })
    expect(indi.children[1].tag).toBe('BIRT')
    expect(indi.children[1].children[0]).toMatchObject({
      tag: 'DATE',
      value: '1 JAN 1900',
    })

    expect(trlr.tag).toBe('TRLR')
  })

  it('行番号を保持する', () => {
    const text = ['0 HEAD', '1 GEDC'].join('\n')
    const { roots } = parseGedcomText(text)

    expect(roots[0].lineNumber).toBe(1)
    expect(roots[0].children[0].lineNumber).toBe(2)
  })

  it('CONTは改行を挟んで値を結合する', () => {
    const text = [
      '0 @I1@ INDI',
      '1 NOTE First line',
      '2 CONT Second line',
    ].join('\n')

    const { roots } = parseGedcomText(text)
    const note = roots[0].children[0]

    expect(note.value).toBe('First line\nSecond line')
  })

  it('CONCは改行なしで値を結合する', () => {
    const text = ['0 @I1@ INDI', '1 NOTE First part', '2 CONC  continued'].join(
      '\n',
    )

    const { roots } = parseGedcomText(text)
    const note = roots[0].children[0]

    expect(note.value).toBe('First part continued')
  })

  it('解釈できない行は警告として読み飛ばす', () => {
    const text = ['0 HEAD', 'not a valid gedcom line', '1 GEDC'].join('\n')

    const { roots, warnings } = parseGedcomText(text)

    expect(warnings).toHaveLength(1)
    expect(warnings[0].lineNumber).toBe(2)
    expect(roots[0].children).toHaveLength(1)
  })

  it('空行は無視する', () => {
    const text = ['0 HEAD', '', '1 GEDC'].join('\n')
    const { roots, warnings } = parseGedcomText(text)

    expect(warnings).toHaveLength(0)
    expect(roots[0].children).toHaveLength(1)
  })
})

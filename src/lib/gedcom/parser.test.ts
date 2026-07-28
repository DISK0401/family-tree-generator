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

  it('値先頭の@@を@へ復号する(CONT/CONC行も含む)', () => {
    const text = [
      '0 @I1@ INDI',
      '1 NOTE @@先頭アットマーク',
      '2 CONT @@続きの行',
    ].join('\n')

    const { roots } = parseGedcomText(text)

    expect(roots[0].children[0].value).toBe('@先頭アットマーク\n@続きの行')
  })

  it('親レベル+1でないCONT/CONCは警告を出して読み飛ばす', () => {
    const text = [
      '0 @I1@ INDI',
      '1 NOTE First',
      '3 CONT wrong level',
      '2 CONC  ok',
    ].join('\n')

    const { roots, warnings } = parseGedcomText(text)

    expect(roots[0].children[0].value).toBe('First ok')
    expect(warnings).toHaveLength(1)
    expect(warnings[0].message).toContain('CONT')
    expect(warnings[0].message).toContain('階層レベル')
  })

  it('通常行のレベル飛び(親+1超)は警告しつつ取り込む', () => {
    const text = ['0 HEAD', '2 GEDC', '3 VERS 7.0'].join('\n')

    const { roots, warnings } = parseGedcomText(text)

    // 取り込み自体は従来どおり最も近い親の子として成立する
    expect(roots[0].children[0].tag).toBe('GEDC')
    expect(roots[0].children[0].children[0].value).toBe('7.0')
    expect(warnings.some((w) => w.message.includes('階層レベルが飛んで'))).toBe(
      true,
    )
  })

  it('解釈できない行の警告は行内容を60文字で切り詰める', () => {
    const longLine = `!${'x'.repeat(200)}`
    const { warnings } = parseGedcomText(['0 HEAD', longLine].join('\n'))

    expect(warnings).toHaveLength(1)
    const embedded = warnings[0].message.replace(
      '解釈できない行のため読み飛ばしました: ',
      '',
    )
    expect(embedded.length).toBeLessThanOrEqual(61)
    expect(embedded.endsWith('…')).toBe(true)
  })
})

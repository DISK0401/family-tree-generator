import { describe, expect, it } from 'vitest'
import { createId } from '../../domain/id'
import type { FamilyTreeData } from '../../domain/model'
import { parseDateString } from '../wareki/parseDate'
import { exportGedcom } from './export'
import { parseGedcomText } from './parser'
import { findChild, findChildren, pointerToXref } from './nodeHelpers'

function findRoot(text: string, tag: string, xref?: string) {
  const { roots } = parseGedcomText(text)
  return roots.find((r) => r.tag === tag && (!xref || r.xref === xref))
}

describe('exportGedcom 基本的なエクスポート', () => {
  it('人物2名と婚姻家族をGEDCOM 7.0として出力する', () => {
    const husband = { id: createId(), name: { family: '山田', given: '太郎' } }
    const wife = { id: createId(), name: { family: '山田', given: '花子' } }
    const family = {
      id: createId(),
      partnerIds: [husband.id, wife.id],
      relationshipType: 'marriage' as const,
      children: [],
    }

    const data: FamilyTreeData = { people: [husband, wife], families: [family] }
    const { text } = exportGedcom(data, '7.0')

    const head = findRoot(text, 'HEAD')
    expect(findChild(findChild(head!, 'GEDC')!, 'VERS')?.value).toBe('7.0')

    const { roots } = parseGedcomText(text)
    expect(roots.filter((r) => r.tag === 'INDI')).toHaveLength(2)
    expect(roots.filter((r) => r.tag === 'FAM')).toHaveLength(1)

    const fam = roots.find((r) => r.tag === 'FAM')!
    expect(findChild(fam, 'MARR')).toBeDefined()
  })
})

describe('exportGedcom 養子縁組のエクスポート', () => {
  it('実親家族に実子、養親家族に養子としてFAMCが2件出力される', () => {
    const child = { id: createId(), name: { given: '一郎' } }
    const biologicalParent = { id: createId(), name: { given: '実親' } }
    const adoptiveParent = { id: createId(), name: { given: '養親' } }

    const biologicalFamily = {
      id: createId(),
      partnerIds: [biologicalParent.id],
      children: [{ personId: child.id, pedigree: 'biological' as const }],
    }
    const adoptiveFamily = {
      id: createId(),
      partnerIds: [adoptiveParent.id],
      children: [{ personId: child.id, pedigree: 'adopted' as const }],
    }

    const data: FamilyTreeData = {
      people: [child, biologicalParent, adoptiveParent],
      families: [biologicalFamily, adoptiveFamily],
    }
    const { text } = exportGedcom(data, '7.0')
    const { roots } = parseGedcomText(text)

    const childIndi = roots.find(
      (r) => r.tag === 'INDI' && findChild(r, 'NAME')?.value === '一郎',
    )!
    const famcNodes = findChildren(childIndi, 'FAMC')
    expect(famcNodes).toHaveLength(2)

    const pediValues = famcNodes.map((n) => findChild(n, 'PEDI')?.value)
    expect(pediValues).toEqual(expect.arrayContaining(['BIRTH', 'ADOPTED']))
  })
})

describe('exportGedcom 読み仮名のエクスポート', () => {
  it('旧字体をそのまま出力し、読み仮名はTRAN構造で出力する', () => {
    const person = {
      id: createId(),
      name: {
        family: '齋藤',
        given: '太郎',
        kana: { family: 'さいとう', given: 'たろう' },
      },
    }
    const data: FamilyTreeData = { people: [person], families: [] }
    const { text } = exportGedcom(data, '7.0')
    const { roots } = parseGedcomText(text)

    const indi = roots.find((r) => r.tag === 'INDI')!
    const nameNode = findChild(indi, 'NAME')!
    expect(nameNode.value).toBe('太郎 /齋藤/')

    const tran = findChild(nameNode, 'TRAN')!
    expect(tran.value).toBe('たろう /さいとう/')
  })
})

describe('exportGedcom 和暦日付のエクスポート', () => {
  it('西暦換算したDATEと和暦原文のPHRASEを出力する', () => {
    const person = {
      id: createId(),
      name: { given: '太郎' },
      birth: { date: parseDateString('明治十年頃') },
    }
    const data: FamilyTreeData = { people: [person], families: [] }
    const { text } = exportGedcom(data, '7.0')
    const { roots } = parseGedcomText(text)

    const indi = roots.find((r) => r.tag === 'INDI')!
    const birt = findChild(indi, 'BIRT')!
    const date = findChild(birt, 'DATE')!

    expect(date.value).toBe('ABT 1877')
    expect(findChild(date, 'PHRASE')?.value).toBe('明治十年頃')
  })
})

describe('exportGedcom 5.5.1互換モード', () => {
  it('ヘッダにVERS 5.5.1とCHAR UTF-8が出力される', () => {
    const data: FamilyTreeData = { people: [], families: [] }
    const { text } = exportGedcom(data, '5.5.1')
    const head = findRoot(text, 'HEAD')!

    expect(findChild(findChild(head, 'GEDC')!, 'VERS')?.value).toBe('5.5.1')
    expect(findChild(head, 'CHAR')?.value).toBe('UTF-8')
  })

  it('事実婚はNOTEで保全され警告が出力される', () => {
    const partnerA = { id: createId(), name: { given: 'A' } }
    const partnerB = { id: createId(), name: { given: 'B' } }
    const family = {
      id: createId(),
      partnerIds: [partnerA.id, partnerB.id],
      relationshipType: 'defacto' as const,
      children: [],
    }
    const data: FamilyTreeData = {
      people: [partnerA, partnerB],
      families: [family],
    }

    const { text, warnings } = exportGedcom(data, '5.5.1')
    const { roots } = parseGedcomText(text)
    const fam = roots.find((r) => r.tag === 'FAM')!

    expect(findChild(fam, 'NOTE')).toBeDefined()
    expect(warnings.some((w) => w.includes('5.5.1では標準表現できない'))).toBe(
      true,
    )
  })
})

describe('exportGedcom バージョンをまたぐ再エクスポートの警告', () => {
  it('5.5.1由来の保全タグを7.0で出力すると警告が列挙される', () => {
    const person = {
      id: createId(),
      name: { given: 'X' },
      unmappedTags: [{ tag: '_MYTAG', value: 'value', children: [] }],
    }
    const data: FamilyTreeData = { people: [person], families: [] }

    const { warnings } = exportGedcom(data, '7.0', '5.5.1')

    expect(
      warnings.some((w) => w.includes('5.5.1由来') && w.includes('7.0')),
    ).toBe(true)
  })

  it('同一バージョンへのエクスポートでは警告が出ない', () => {
    const person = {
      id: createId(),
      name: { given: 'X' },
      unmappedTags: [{ tag: '_MYTAG', value: 'value', children: [] }],
    }
    const data: FamilyTreeData = { people: [person], families: [] }

    const { warnings } = exportGedcom(data, '5.5.1', '5.5.1')

    expect(warnings).toHaveLength(0)
  })
})

describe('exportGedcom xrefラウンドトリップ', () => {
  it('FAMC/CHIL/HUSB/WIFのポインタが正しいxrefを指す', () => {
    const husband = { id: createId(), name: { given: 'H' } }
    const wife = { id: createId(), name: { given: 'W' } }
    const child = { id: createId(), name: { given: 'C' } }
    const family = {
      id: createId(),
      partnerIds: [husband.id, wife.id],
      children: [{ personId: child.id, pedigree: 'biological' as const }],
    }
    const data: FamilyTreeData = {
      people: [husband, wife, child],
      families: [family],
    }

    const { text } = exportGedcom(data, '7.0')
    const { roots } = parseGedcomText(text)
    const fam = roots.find((r) => r.tag === 'FAM')!
    const husbandXref = pointerToXref(findChild(fam, 'HUSB')?.value)
    const husbandIndi = roots.find(
      (r) => r.tag === 'INDI' && r.xref === husbandXref,
    )
    expect(findChild(husbandIndi!, 'NAME')?.value).toBe('H')
  })
})

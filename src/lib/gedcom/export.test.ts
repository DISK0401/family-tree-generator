import { describe, expect, it } from 'vitest'
import { createTreeDocument } from '../../domain/helpers'
import {
  addChild,
  addChildLink,
  addPerson,
  addSpouse,
  updateFamily,
} from '../../domain/commands'
import { parseDateInput } from '../../domain/parse-date'
import { exportGedcom } from './export'
import { parseGedcomText } from './parser'
import { findChild, findChildren, pointerToXref } from './nodeHelpers'

function findRoot(text: string, tag: string) {
  const { roots } = parseGedcomText(text)
  return roots.find((root) => root.tag === tag)
}

describe('exportGedcom 基本的なエクスポート', () => {
  it('人物2名と婚姻家族をGEDCOM 7.0として出力する', () => {
    let document = createTreeDocument()
    const husband = addPerson(document, {
      name: { surname: '山田', given: '太郎' },
    })
    document = husband.doc
    const wife = addSpouse(document, husband.personId, {
      name: { surname: '山田', given: '花子' },
    })
    document = updateFamily(wife.doc, wife.familyId, { kind: 'married' })

    const { text } = exportGedcom(document, '7.0')

    const head = findRoot(text, 'HEAD')
    expect(findChild(findChild(head!, 'GEDC')!, 'VERS')?.value).toBe('7.0')

    const { roots } = parseGedcomText(text)
    expect(roots.filter((r) => r.tag === 'INDI')).toHaveLength(2)
    expect(roots.filter((r) => r.tag === 'FAM')).toHaveLength(1)

    const fam = roots.find((r) => r.tag === 'FAM')!
    expect(findChild(fam, 'HUSB')).toBeDefined()
    expect(findChild(fam, 'WIFE')).toBeDefined()
  })
})

describe('exportGedcom 養子縁組のエクスポート', () => {
  it('実親家族に実子、養親家族に養子としてFAMCが2件出力される', () => {
    let document = createTreeDocument()
    const bioParent = addPerson(document, { name: { given: '実親' } })
    document = bioParent.doc
    const child = addChild(document, bioParent.personId, {
      name: { given: '一郎' },
    })
    document = child.doc
    const adoptiveParent = addPerson(document, { name: { given: '養親' } })
    document = adoptiveParent.doc
    const adoptiveFamily = addSpouse(document, adoptiveParent.personId, {
      name: { given: 'ダミー' },
    })
    document = adoptiveFamily.doc
    document = addChildLink(
      document,
      adoptiveFamily.familyId,
      child.childId,
      'adopted',
    )

    const { text } = exportGedcom(document, '7.0')
    const { roots } = parseGedcomText(text)

    const childIndi = roots.find(
      (r) =>
        r.tag === 'INDI' &&
        findChild(findChild(r, 'NAME')!, 'GIVN')?.value === '一郎',
    )!
    const famcNodes = findChildren(childIndi, 'FAMC')
    expect(famcNodes).toHaveLength(2)

    const pediValues = famcNodes.map((n) => findChild(n, 'PEDI')?.value)
    expect(pediValues).toEqual(expect.arrayContaining(['BIRTH', 'ADOPTED']))
  })
})

describe('exportGedcom 読み仮名のエクスポート', () => {
  it('旧字体をそのまま出力し、読み仮名は拡張タグで出力する', () => {
    let document = createTreeDocument()
    const person = addPerson(document, {
      name: {
        surname: '齋藤',
        given: '太郎',
        surnameKana: 'さいとう',
        givenKana: 'たろう',
      },
    })
    document = person.doc

    const { text } = exportGedcom(document, '7.0')
    const { roots } = parseGedcomText(text)

    const indi = roots.find((r) => r.tag === 'INDI')!
    const nameNode = findChild(indi, 'NAME')!
    expect(nameNode.value).toBe('太郎 /齋藤/')
    expect(findChild(nameNode, '_KANA_SURN')?.value).toBe('さいとう')
  })
})

describe('exportGedcom 和暦日付のエクスポート', () => {
  it('西暦換算したDATEと和暦原文のPHRASEを出力する', () => {
    let document = createTreeDocument()
    const birthDate = parseDateInput('明治10年頃')
    expect(birthDate.ok).toBe(true)
    const person = addPerson(document, {
      name: { given: '太郎' },
      birth: birthDate.ok
        ? { type: 'birth', date: birthDate.value }
        : undefined,
    })
    document = person.doc

    const { text } = exportGedcom(document, '7.0')
    const { roots } = parseGedcomText(text)

    const indi = roots.find((r) => r.tag === 'INDI')!
    const birt = findChild(indi, 'BIRT')!
    const date = findChild(birt, 'DATE')!

    expect(date.value).toBe('ABT 1877')
    expect(findChild(date, 'PHRASE')?.value).toBe('明治10年頃')
  })
})

describe('exportGedcom 5.5.1互換モード', () => {
  it('ヘッダにVERS 5.5.1とCHAR UTF-8が出力される', () => {
    const document = createTreeDocument()
    const { text } = exportGedcom(document, '5.5.1')
    const head = findRoot(text, 'HEAD')!

    expect(findChild(findChild(head, 'GEDC')!, 'VERS')?.value).toBe('5.5.1')
    expect(findChild(head, 'CHAR')?.value).toBe('UTF-8')
  })

  it('事実婚(common-law)は_FAM_KIND拡張タグで両バージョンとも出力される', () => {
    let document = createTreeDocument()
    const partnerA = addPerson(document, { name: { given: 'A' } })
    document = partnerA.doc
    const family = addSpouse(document, partnerA.personId, {
      name: { given: 'B' },
    })
    document = updateFamily(family.doc, family.familyId, { kind: 'common-law' })

    const { text, warnings } = exportGedcom(document, '5.5.1')
    const { roots } = parseGedcomText(text)
    const fam = roots.find((r) => r.tag === 'FAM')!

    expect(findChild(fam, '_FAM_KIND')?.value).toBe('common-law')
    expect(warnings).toHaveLength(0)
  })
})

describe('exportGedcom xrefラウンドトリップ', () => {
  it('HUSB/WIFE/CHILのポインタが正しいxrefを指す', () => {
    let document = createTreeDocument()
    const husband = addPerson(document, { name: { given: 'H' } })
    document = husband.doc
    const wife = addSpouse(document, husband.personId, { name: { given: 'W' } })
    document = wife.doc
    const child = addChild(
      document,
      husband.personId,
      { name: { given: 'C' } },
      {
        otherParentId: wife.spouseId,
      },
    )
    document = child.doc

    const { text } = exportGedcom(document, '7.0')
    const { roots } = parseGedcomText(text)
    const fam = roots.find((r) => r.tag === 'FAM')!
    const husbandXref = pointerToXref(findChild(fam, 'HUSB')?.value)
    const husbandIndi = roots.find(
      (r) => r.tag === 'INDI' && r.xref === husbandXref,
    )
    expect(findChild(findChild(husbandIndi!, 'NAME')!, 'GIVN')?.value).toBe('H')
  })

  it('3名以上のパートナーは警告付きで非標準出力される', () => {
    let document = createTreeDocument()
    const p1 = addPerson(document, { name: { given: 'A' } })
    document = p1.doc
    const p2 = addPerson(document, { name: { given: 'B' } })
    document = p2.doc
    const p3 = addPerson(document, { name: { given: 'C' } })
    document = p3.doc
    const family = {
      id: 'f-multi',
      spouseIds: [p1.personId, p2.personId, p3.personId],
      kind: 'unknown' as const,
      events: [],
      children: [],
    }
    document = {
      ...document,
      families: { ...document.families, [family.id]: family },
    }

    const { warnings } = exportGedcom(document, '7.0')
    expect(warnings.some((w) => w.includes('3名以上'))).toBe(true)
  })
})

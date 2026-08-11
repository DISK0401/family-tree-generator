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

  it('5.5.1で必須のSOUR・SUBM参照・GEDC FORM・SUBMレコードが出力される', () => {
    const document = createTreeDocument()
    const { text } = exportGedcom(document, '5.5.1')
    const { roots } = parseGedcomText(text)
    const head = roots.find((r) => r.tag === 'HEAD')!

    const sour = findChild(head, 'SOUR')!
    expect(sour.value).toBe('KAKEIZUCHO')
    expect(findChild(sour, 'NAME')?.value).toBe('家系図帖')

    expect(findChild(head, 'SUBM')?.value).toBe('@U1@')
    expect(findChild(findChild(head, 'GEDC')!, 'FORM')?.value).toBe(
      'LINEAGE-LINKED',
    )

    const subm = roots.find((r) => r.tag === 'SUBM')
    expect(subm?.xref).toBe('U1')
    expect(findChild(subm!, 'NAME')?.value).toBe('家系図帖の利用者')
  })

  it('両バージョンでヘッダにDATE(updatedAt由来・大文字月名)が出力される', () => {
    const document = {
      ...createTreeDocument(),
      updatedAt: '2026-07-28T12:34:56.000Z',
    }

    for (const version of ['5.5.1', '7.0'] as const) {
      const { text } = exportGedcom(document, version)
      const head = findRoot(text, 'HEAD')!
      expect(findChild(head, 'DATE')?.value).toBe('28 JUL 2026')
    }
  })

  it('7.0ではSUBM・SOUR・FORMを出力しない(5.5.1固有の必須要素)', () => {
    const document = createTreeDocument()
    const { text } = exportGedcom(document, '7.0')
    const { roots } = parseGedcomText(text)
    const head = roots.find((r) => r.tag === 'HEAD')!

    expect(findChild(head, 'SOUR')).toBeUndefined()
    expect(findChild(head, 'SUBM')).toBeUndefined()
    expect(roots.some((r) => r.tag === 'SUBM')).toBe(false)
  })

  it('出生順(birthOrder)は_BIRTH_ORDER拡張タグで両バージョンとも出力される(issue #49)', () => {
    let document = createTreeDocument()
    const person = addPerson(document, {
      name: { given: '次郎' },
      birthOrder: 2,
    })
    document = person.doc

    for (const version of ['7.0', '5.5.1'] as const) {
      const { text, warnings } = exportGedcom(document, version)
      const { roots } = parseGedcomText(text)
      const indi = roots.find((r) => r.tag === 'INDI')!

      expect(findChild(indi, '_BIRTH_ORDER')?.value).toBe('2')
      expect(warnings).toHaveLength(0)
    }
  })

  it('出生順(birthOrder)未設定の人物には_BIRTH_ORDERタグが出力されない', () => {
    let document = createTreeDocument()
    const person = addPerson(document, { name: { given: '太郎' } })
    document = person.doc

    const { text } = exportGedcom(document, '7.0')
    const { roots } = parseGedcomText(text)
    const indi = roots.find((r) => r.tag === 'INDI')!

    expect(findChild(indi, '_BIRTH_ORDER')).toBeUndefined()
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

describe('exportGedcom 7.0のSCHMA拡張タグ宣言', () => {
  it('使用する独自拡張タグをSCHMAのTAGで宣言する', () => {
    const document = createTreeDocument()
    const { text } = exportGedcom(document, '7.0')
    const head = findRoot(text, 'HEAD')!
    const schma = findChild(head, 'SCHMA')!

    const declared = findChildren(schma, 'TAG').map(
      (n) => n.value?.split(' ')[0],
    )
    expect(declared).toEqual([
      '_KANA_SURN',
      '_KANA_GIVN',
      '_FAM_KIND',
      '_BIRTH_ORDER',
      '_TREE_TITLE',
      '_SPOUSE_ROLE_UNKNOWN',
    ])
    // 各宣言はタグ名+識別URIの形式
    for (const tag of findChildren(schma, 'TAG')) {
      expect(tag.value).toMatch(/^_[A-Z_]+ https:\/\//)
    }
  })

  it('5.5.1ではSCHMAを出力しない', () => {
    const document = createTreeDocument()
    const { text } = exportGedcom(document, '5.5.1')
    const head = findRoot(text, 'HEAD')!

    expect(findChild(head, 'SCHMA')).toBeUndefined()
  })
})

describe('exportGedcom HUSB/WIFEの性別ベース割当', () => {
  it('妻→夫の順で登録された家族でもmaleがHUSB・femaleがWIFEになる', () => {
    let document = createTreeDocument()
    const wifeFirst = addPerson(document, {
      name: { given: '花子' },
      gender: 'female',
    })
    document = wifeFirst.doc
    const family = addSpouse(document, wifeFirst.personId, {
      name: { given: '太郎' },
      gender: 'male',
    })
    document = family.doc

    const { text } = exportGedcom(document, '7.0')
    const { roots } = parseGedcomText(text)
    const fam = roots.find((r) => r.tag === 'FAM')!

    const husbXref = pointerToXref(findChild(fam, 'HUSB')?.value)
    const husbIndi = roots.find((r) => r.tag === 'INDI' && r.xref === husbXref)!
    expect(findChild(findChild(husbIndi, 'NAME')!, 'GIVN')?.value).toBe('太郎')
    // 性別で確定できるため未確定フラグは出力されない
    expect(findChild(fam, '_SPOUSE_ROLE_UNKNOWN')).toBeUndefined()
  })

  it('両者の性別が不明な場合は登録順で割り当て_SPOUSE_ROLE_UNKNOWNを出力する', () => {
    let document = createTreeDocument()
    const a = addPerson(document, { name: { given: 'A' } })
    document = a.doc
    const family = addSpouse(document, a.personId, { name: { given: 'B' } })
    document = family.doc

    const { text } = exportGedcom(document, '7.0')
    const { roots } = parseGedcomText(text)
    const fam = roots.find((r) => r.tag === 'FAM')!

    const husbXref = pointerToXref(findChild(fam, 'HUSB')?.value)
    const husbIndi = roots.find((r) => r.tag === 'INDI' && r.xref === husbXref)!
    expect(findChild(findChild(husbIndi, 'NAME')!, 'GIVN')?.value).toBe('A')
    expect(findChild(fam, '_SPOUSE_ROLE_UNKNOWN')?.value).toBe('Y')
  })

  it('ひとり親が女性の場合はWIFE枠のみに出力する', () => {
    let document = createTreeDocument()
    const mother = addPerson(document, {
      name: { given: '母' },
      gender: 'female',
    })
    document = mother.doc
    const child = addChild(document, mother.personId, {
      name: { given: '子' },
    })
    document = child.doc

    const { text } = exportGedcom(document, '7.0')
    const { roots } = parseGedcomText(text)
    const fam = roots.find((r) => r.tag === 'FAM')!

    expect(findChild(fam, 'WIFE')).toBeDefined()
    expect(findChild(fam, 'HUSB')).toBeUndefined()
    expect(findChild(fam, '_SPOUSE_ROLE_UNKNOWN')).toBeUndefined()
  })
})

describe('exportGedcom 続柄unknownのPEDI出力', () => {
  function documentWithUnknownPedigree() {
    let document = createTreeDocument()
    const parent = addPerson(document, { name: { given: '親' } })
    document = parent.doc
    const child = addChild(document, parent.personId, {
      name: { given: '子' },
    })
    document = child.doc
    document = {
      ...document,
      families: Object.fromEntries(
        Object.entries(document.families).map(([id, family]) => [
          id,
          {
            ...family,
            children: family.children.map((link) => ({
              ...link,
              pedigree: 'unknown' as const,
            })),
          },
        ]),
      ),
    }
    return document
  }

  it('5.5.1では規格外値を出さずPEDIタグ自体を省略する', () => {
    const { text } = exportGedcom(documentWithUnknownPedigree(), '5.5.1')
    const { roots } = parseGedcomText(text)
    const childIndi = roots.find(
      (r) => r.tag === 'INDI' && findChild(r, 'FAMC') !== undefined,
    )!
    const famc = findChild(childIndi, 'FAMC')!

    expect(findChild(famc, 'PEDI')).toBeUndefined()
  })

  it('7.0ではPEDI OTHER+PHRASE 続柄不明を出力する', () => {
    const { text } = exportGedcom(documentWithUnknownPedigree(), '7.0')
    const { roots } = parseGedcomText(text)
    const childIndi = roots.find(
      (r) => r.tag === 'INDI' && findChild(r, 'FAMC') !== undefined,
    )!
    const pedi = findChild(findChild(childIndi, 'FAMC')!, 'PEDI')!

    expect(pedi.value).toBe('OTHER')
    expect(findChild(pedi, 'PHRASE')?.value).toBe('続柄不明')
  })
})

describe('exportGedcom 氏名が空の人物', () => {
  it('氏名が完全に空の人物はNAMEタグ自体を省略する(両バージョン)', () => {
    let document = createTreeDocument()
    const person = addPerson(document, { name: {} })
    document = person.doc

    for (const version of ['5.5.1', '7.0'] as const) {
      const { text } = exportGedcom(document, version)
      const { roots } = parseGedcomText(text)
      const indi = roots.find((r) => r.tag === 'INDI')!
      expect(findChild(indi, 'NAME')).toBeUndefined()
    }
  })
})

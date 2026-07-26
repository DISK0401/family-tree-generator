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
import { importGedcom } from './import'

function bytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

describe('GEDCOM export→importのラウンドトリップ', () => {
  it('養子・和暦原文・かな表記を含むドキュメントが同一バージョンで意味的に復元される', () => {
    let document = createTreeDocument()
    const bioParent = addPerson(document, {
      name: { surname: '渡邊', given: '一', surnameKana: 'わたなべ' },
    })
    document = bioParent.doc

    const birthDate = parseDateInput('明治10年頃')
    expect(birthDate.ok).toBe(true)
    const child = addChild(document, bioParent.personId, {
      name: { surname: '渡邊', given: '五郎' },
      birth: birthDate.ok
        ? { type: 'birth', date: birthDate.value }
        : undefined,
    })
    document = child.doc

    const adoptiveParent = addPerson(document, { name: { given: '養親' } })
    document = adoptiveParent.doc
    const adoptiveFamily = addSpouse(document, adoptiveParent.personId, {
      name: { given: 'ダミー' },
    })
    document = updateFamily(adoptiveFamily.doc, adoptiveFamily.familyId, {
      kind: 'common-law',
    })
    document = addChildLink(
      document,
      adoptiveFamily.familyId,
      child.childId,
      'adopted',
    )

    const { text } = exportGedcom(document, '5.5.1')
    const reimported = importGedcom(bytesOf(text))

    expect(reimported.success).toBe(true)
    if (!reimported.success) return

    expect(Object.keys(reimported.document.persons)).toHaveLength(4)
    expect(Object.keys(reimported.document.families)).toHaveLength(2)

    const reimportedChild = Object.values(reimported.document.persons).find(
      (p) => p.name.given === '五郎',
    )
    expect(reimportedChild?.name.surnameKana).toBeUndefined()
    expect(reimportedChild?.birth?.date?.original).toBe('明治10年頃')
    expect(reimportedChild?.birth?.date?.date).toEqual({
      year: 1877,
      month: undefined,
      day: undefined,
    })

    const pedigrees = Object.values(reimported.document.families)
      .flatMap((f) => f.children)
      .filter((c) => c.childId === reimportedChild?.id)
      .map((c) => c.pedigree)
    expect(pedigrees).toEqual(expect.arrayContaining(['biological', 'adopted']))

    const commonLawFamily = Object.values(reimported.document.families).find(
      (f) => f.kind === 'common-law',
    )
    expect(commonLawFamily).toBeDefined()
  })
})

describe('関係を持たない人物のラウンドトリップ', () => {
  it('どのFamilyにも属さない人物がFAMS/FAMCなしのINDIとして出力され、復元される', () => {
    let document = createTreeDocument()
    const a = addPerson(document, { name: { surname: '山田', given: '太郎' } })
    document = a.doc
    const spouse = addSpouse(document, a.personId, { name: { surname: '山田', given: '花子' } })
    document = spouse.doc
    // 系統を決めずに先に登録した人物(旧字体を含む)
    const standalone = addPerson(document, { name: { surname: '富岡', given: '榮' } })
    document = standalone.doc

    const { text } = exportGedcom(document, '7.0')

    // 当該INDIレコードには家族参照が出力されない
    const records = text.split(/\r?\n(?=0 @)/)
    const standaloneRecord = records.find((r) => r.includes('榮'))
    expect(standaloneRecord).toBeDefined()
    expect(standaloneRecord).not.toContain('FAMS')
    expect(standaloneRecord).not.toContain('FAMC')

    const reimported = importGedcom(bytesOf(text))
    expect(reimported.success).toBe(true)
    if (!reimported.success) return

    expect(Object.keys(reimported.document.persons)).toHaveLength(3)
    const restored = Object.values(reimported.document.persons).find(
      (p) => p.name.given === '榮',
    )
    expect(restored).toBeDefined()
    // どのFamilyにも属さないまま復元される
    const belongs = Object.values(reimported.document.families).some(
      (f) =>
        f.spouseIds.includes(restored?.id ?? '') ||
        f.children.some((c) => c.childId === restored?.id),
    )
    expect(belongs).toBe(false)
  })
})

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

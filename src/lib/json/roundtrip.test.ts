import { describe, expect, it } from 'vitest'
import { createTreeDocument } from '../../domain/helpers'
import {
  addChild,
  addChildLink,
  addFamilyEvent,
  addPerson,
  addSpouse,
  updateFamily,
} from '../../domain/commands'
import { parseDateInput } from '../../domain/parse-date'
import { exportFamilyTreeJsonText } from './export'
import { importFamilyTreeJson } from './import'

describe('JSONラウンドトリップの完全性', () => {
  it('養子・再婚・事実婚・和暦原文を含む複雑なドキュメントが等価に復元される', () => {
    let document = createTreeDocument({ title: 'テスト家系図' })

    const father = addPerson(document, {
      name: { surname: '渡邊', given: '二', surnameKana: 'わたなべ' },
    })
    document = father.doc

    const bio = addSpouse(document, father.personId, {
      name: { given: '四子' },
    })
    document = bio.doc
    document = updateFamily(document, bio.familyId, { kind: 'married' })

    const birthDate = parseDateInput('明治10年頃')
    expect(birthDate.ok).toBe(true)

    const child = addChild(document, father.personId, {
      name: { surname: '渡邊', given: '五郎' },
      birth: birthDate.ok
        ? { type: 'birth', date: birthDate.value }
        : undefined,
    })
    document = child.doc

    const step = addSpouse(document, father.personId, {
      name: { given: '三子' },
    })
    document = step.doc
    document = updateFamily(document, step.familyId, { kind: 'common-law' })
    document = addChildLink(document, step.familyId, child.childId, 'step')
    document = addFamilyEvent(document, bio.familyId, {
      type: 'divorce',
      place: '東京',
    })

    const text = exportFamilyTreeJsonText(document)
    const result = importFamilyTreeJson(text)

    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.document).toEqual(document)
  })
})

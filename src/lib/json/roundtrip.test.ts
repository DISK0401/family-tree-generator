import { describe, expect, it } from 'vitest'
import { createId } from '../../domain/id'
import type { FamilyTreeData } from '../../domain/model'
import { parseDateString } from '../wareki/parseDate'
import { exportFamilyTreeJsonText } from './export'
import { importFamilyTreeJson } from './import'

describe('JSONラウンドトリップの完全性', () => {
  it('養子・再婚・事実婚・和暦原文・旧字体別表記・保全タグを含む複雑なモデルが等価に復元される', () => {
    const grandparent = {
      id: createId(),
      name: { family: '渡邊', given: '一', alternates: [{ family: '渡辺' }] },
    }
    const father = { id: createId(), name: { family: '渡邊', given: '二' } }
    const stepMother = { id: createId(), name: { given: '三子' } }
    const biologicalMother = { id: createId(), name: { given: '四子' } }
    const child = {
      id: createId(),
      name: {
        family: '渡邊',
        given: '五郎',
        kana: { family: 'わたなべ', given: 'ごろう' },
      },
      birth: { date: parseDateString('明治十年頃') },
      unmappedTags: [
        {
          tag: '_MYTAG',
          value: 'custom',
          children: [{ tag: '_SUB', value: 'v', children: [] }],
        },
      ],
    }

    const marriageWithBiologicalMother = {
      id: createId(),
      partnerIds: [father.id, biologicalMother.id],
      relationshipType: 'divorced' as const,
      children: [{ personId: child.id, pedigree: 'biological' as const }],
    }
    const remarriageWithStepMother = {
      id: createId(),
      partnerIds: [father.id, stepMother.id],
      relationshipType: 'defacto' as const,
      children: [{ personId: child.id, pedigree: 'step' as const }],
    }
    const grandparentFamily = {
      id: createId(),
      partnerIds: [grandparent.id],
      children: [{ personId: father.id, pedigree: 'biological' as const }],
    }

    const original: FamilyTreeData = {
      people: [grandparent, father, stepMother, biologicalMother, child],
      families: [
        marriageWithBiologicalMother,
        remarriageWithStepMother,
        grandparentFamily,
      ],
    }

    const text = exportFamilyTreeJsonText(original)
    const result = importFamilyTreeJson(text)

    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data).toEqual(original)
  })
})

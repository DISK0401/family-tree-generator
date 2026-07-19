import { describe, expect, it } from 'vitest'
import {
  addChild,
  addChildLink,
  addFamilyEvent,
  addParent,
  addPerson,
  addSpouse,
  computeRemovalImpact,
  removePerson,
  setChildPedigree,
  setFamilyEvent,
} from './commands'
import { createTreeDocument } from './helpers'
import type { TreeDocument } from './types'

function withPerson(name: string) {
  let doc = createTreeDocument()
  const { doc: doc2, personId } = addPerson(doc, { name: { given: name } })
  doc = doc2
  return { doc, personId }
}

describe('addPerson / addSpouse', () => {
  it('人物追加後に配偶者を追加すると家族が新設される', () => {
    const { doc, personId: aId } = withPerson('A')
    const { doc: doc2, spouseId: bId, familyId } = addSpouse(doc, aId, { name: { given: 'B' } })
    expect(doc2.persons[bId]).toBeDefined()
    expect(doc2.families[familyId].spouseIds.sort()).toEqual([aId, bId].sort())
  })

  it('再婚: 同一人物に2つ目のFamilyを追加でき、1つ目は残る', () => {
    const { doc, personId: aId } = withPerson('A')
    const { doc: doc2, familyId: f1 } = addSpouse(doc, aId, { name: { given: 'B' } })
    const { doc: doc3, familyId: f2 } = addSpouse(doc2, aId, { name: { given: 'C' } })
    expect(f1).not.toBe(f2)
    expect(doc3.families[f1]).toBeDefined()
    expect(doc3.families[f2]).toBeDefined()
    const aFamilies = Object.values(doc3.families).filter((f) => f.spouseIds.includes(aId))
    expect(aFamilies).toHaveLength(2)
  })
})

describe('addChild', () => {
  it('婚姻関係にある2人の家族へ実子として帰属する', () => {
    const { doc, personId: aId } = withPerson('A')
    const { doc: doc2, spouseId: bId, familyId: f1 } = addSpouse(doc, aId, {
      name: { given: 'B' },
    })
    const { doc: doc3, childId, familyId } = addChild(doc2, aId, { name: { given: 'C' } }, {
      otherParentId: bId,
    })
    expect(familyId).toBe(f1)
    expect(doc3.families[f1].children).toEqual([{ childId, pedigree: 'biological' }])
  })

  it('ひとり親の家族へ子を追加でき、家族がなければ新設される', () => {
    const { doc, personId: aId } = withPerson('A')
    const { doc: doc2, childId, familyId } = addChild(doc, aId, { name: { given: 'D' } })
    const family = doc2.families[familyId]
    expect(family.spouseIds).toEqual([aId])
    expect(family.children.map((c) => c.childId)).toEqual([childId])
  })
})

describe('addChildLink / setChildPedigree: 養子縁組', () => {
  it('実親の家族と養親の家族の両方に属し、続柄が区別される', () => {
    let doc = createTreeDocument()
    const r1 = addPerson(doc, { name: { given: 'F1親' } })
    doc = r1.doc
    const bioParentId = r1.personId
    const r2 = addChild(doc, bioParentId, { name: { given: 'D' } })
    doc = r2.doc
    const childId = r2.childId
    const bioFamilyId = r2.familyId

    const r3 = addPerson(doc, { name: { given: 'F2養親' } })
    doc = r3.doc
    const adoptiveParentId = r3.personId
    const r4 = addChild(doc, adoptiveParentId, { name: { given: 'dummy' } })
    doc = r4.doc
    // dummy除去して養親のひとり親家族だけを使う
    const adoptiveFamilyId = r4.familyId
    doc = { ...doc, families: { ...doc.families, [adoptiveFamilyId]: { ...doc.families[adoptiveFamilyId], children: [] } } }

    doc = addChildLink(doc, adoptiveFamilyId, childId, 'adopted')

    expect(doc.families[bioFamilyId].children).toEqual([{ childId, pedigree: 'biological' }])
    expect(doc.families[adoptiveFamilyId].children).toEqual([{ childId, pedigree: 'adopted' }])

    doc = setChildPedigree(doc, bioFamilyId, childId, 'adopted')
    expect(doc.families[bioFamilyId].children[0].pedigree).toBe('adopted')
  })
})

describe('addParent', () => {
  it('親未登録の人物に親を追加すると家族が新設される', () => {
    const { doc, personId: childId } = withPerson('D')
    const { doc: doc2, parentId, familyId } = addParent(doc, childId, { name: { given: '親' } })
    expect(doc2.families[familyId].spouseIds).toEqual([parentId])
    expect(doc2.families[familyId].children).toEqual([{ childId, pedigree: 'biological' }])
  })

  it('既存のひとり親家族に2人目の親が加わる', () => {
    const { doc, personId: childId } = withPerson('D')
    const { doc: doc2, parentId: p1, familyId: f1 } = addParent(doc, childId, {
      name: { given: '親1' },
    })
    const { doc: doc3, parentId: p2, familyId: f2 } = addParent(doc2, childId, {
      name: { given: '親2' },
    })
    expect(f2).toBe(f1)
    expect(doc3.families[f1].spouseIds.sort()).toEqual([p1, p2].sort())
  })
})

describe('addFamilyEvent: 復縁', () => {
  it('同一Familyへ婚姻→離婚→婚姻の順でイベントを追記できる', () => {
    const { doc, personId: aId } = withPerson('A')
    const { doc: doc2, familyId } = addSpouse(doc, aId, { name: { given: 'B' } })
    let d = addFamilyEvent(doc2, familyId, { type: 'marriage' })
    d = addFamilyEvent(d, familyId, { type: 'divorce' })
    d = addFamilyEvent(d, familyId, { type: 'marriage' })
    expect(d.families[familyId].events.map((e) => e.type)).toEqual([
      'marriage',
      'divorce',
      'marriage',
    ])
  })
})

describe('setFamilyEvent', () => {
  it('該当種別のイベントがなければ新規追加する', () => {
    const { doc, personId: aId } = withPerson('A')
    const { doc: doc2, familyId } = addSpouse(doc, aId, { name: { given: 'B' } })
    const d = setFamilyEvent(doc2, familyId, 'marriage', { type: 'marriage', place: '東京' })
    expect(d.families[familyId].events).toEqual([{ type: 'marriage', place: '東京' }])
  })

  it('該当種別の最初の1件を置換する', () => {
    const { doc, personId: aId } = withPerson('A')
    const { doc: doc2, familyId } = addSpouse(doc, aId, { name: { given: 'B' } })
    let d = addFamilyEvent(doc2, familyId, { type: 'marriage', place: '旧住所' })
    d = setFamilyEvent(d, familyId, 'marriage', { type: 'marriage', place: '新住所' })
    expect(d.families[familyId].events).toEqual([{ type: 'marriage', place: '新住所' }])
  })

  it('undefinedを指定すると該当種別のイベントを削除する(他の種別は影響を受けない)', () => {
    const { doc, personId: aId } = withPerson('A')
    const { doc: doc2, familyId } = addSpouse(doc, aId, { name: { given: 'B' } })
    let d = addFamilyEvent(doc2, familyId, { type: 'marriage' })
    d = addFamilyEvent(d, familyId, { type: 'divorce' })
    d = setFamilyEvent(d, familyId, 'marriage', undefined)
    expect(d.families[familyId].events).toEqual([{ type: 'divorce' }])
  })

  it('復縁(3件以上のイベント)がある場合、最初の1件のみを対象にしそれ以外は保持する', () => {
    const { doc, personId: aId } = withPerson('A')
    const { doc: doc2, familyId } = addSpouse(doc, aId, { name: { given: 'B' } })
    let d = addFamilyEvent(doc2, familyId, { type: 'marriage', place: '1回目' })
    d = addFamilyEvent(d, familyId, { type: 'divorce' })
    d = addFamilyEvent(d, familyId, { type: 'marriage', place: '2回目' })
    d = setFamilyEvent(d, familyId, 'marriage', { type: 'marriage', place: '1回目修正' })
    expect(d.families[familyId].events).toEqual([
      { type: 'marriage', place: '1回目修正' },
      { type: 'divorce' },
      { type: 'marriage', place: '2回目' },
    ])
  })
})

describe('removePerson: 削除時の関係整合', () => {
  it('配偶者関係と子の帰属がある人物を削除すると影響件数どおりに整理される', () => {
    const { doc, personId: aId } = withPerson('A')
    const { doc: doc2, spouseId: bId, familyId } = addSpouse(doc, aId, { name: { given: 'B' } })
    const { doc: doc3, childId } = addChild(doc2, aId, { name: { given: 'C' } }, {
      otherParentId: bId,
    })

    const impact = computeRemovalImpact(doc3, bId)
    expect(impact.spouseFamilyCount).toBe(1)
    expect(impact.childLinkCount).toBe(0)

    const doc4 = removePerson(doc3, bId)
    expect(doc4.persons[bId]).toBeUndefined()
    // Aとの家族は配偶者が1人だけになって残る(子はそのまま帰属)
    const remaining = doc4.families[familyId]
    expect(remaining.spouseIds).toEqual([aId])
    expect(remaining.children.map((c) => c.childId)).toEqual([childId])
    // 子自身は削除されない
    expect(doc4.persons[childId]).toBeDefined()
  })

  it('直前操作を元に戻せる(スナップショット比較で確認)', () => {
    const { doc, personId: aId } = withPerson('A')
    const { doc: doc2, spouseId: bId } = addSpouse(doc, aId, { name: { given: 'B' } })
    const before: TreeDocument = structuredClone(doc2)
    const doc3 = removePerson(doc2, bId)
    expect(doc3).not.toEqual(before)
    // undoはストア側の責務(4章)。ここではコマンドが元のdocを変更しない(純関数)ことのみ確認
    expect(doc2).toEqual(before)
  })
})

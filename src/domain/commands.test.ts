import { describe, expect, it } from 'vitest'
import {
  addChild,
  addChildLink,
  addFamilyEvent,
  addParent,
  addPerson,
  addSpouse,
  addSpouseLink,
  computeRemovalImpact,
  removePerson,
  setChildPedigree,
  setFamilyEvent,
} from './commands'
import { createFamily, createTreeDocument } from './helpers'
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

describe('removePerson: 意味を持たない家族を残さない', () => {
  /** 手動で家族を差し込む(インポート等でしか生じない形を再現するため) */
  function putFamilyRaw(doc: TreeDocument, family: ReturnType<typeof createFamily>): TreeDocument {
    return { ...doc, families: { ...doc.families, [family.id]: family } }
  }

  it('子のいない夫婦の片方を削除すると家族ごと削除される', () => {
    const { doc, personId: aId } = withPerson('A')
    const { doc: doc2, spouseId: bId, familyId } = addSpouse(doc, aId, { name: { given: 'B' } })

    const doc3 = removePerson(doc2, bId)
    // 配偶者Aだけが残った空の家族は保持しない
    expect(doc3.families[familyId]).toBeUndefined()
    expect(doc3.persons[aId]).toBeDefined()
  })

  it('子のいる夫婦の片方を削除するとひとり親家族として残る', () => {
    const { doc, personId: aId } = withPerson('A')
    const { doc: doc2, spouseId: bId, familyId } = addSpouse(doc, aId, { name: { given: 'B' } })
    const { doc: doc3, childId } = addChild(doc2, aId, { name: { given: 'C' } }, {
      otherParentId: bId,
    })

    const doc4 = removePerson(doc3, bId)
    expect(doc4.families[familyId].spouseIds).toEqual([aId])
    expect(doc4.families[familyId].children.map((c) => c.childId)).toEqual([childId])
  })

  it('配偶者が誰もいなくなった家族は子がいても削除され、子は人物として残る', () => {
    const { doc, personId: cId } = withPerson('C')
    const { doc: doc2, parentId: pId, familyId } = addParent(doc, cId, { name: { given: 'P' } })

    const doc3 = removePerson(doc2, pId)
    expect(doc3.families[familyId]).toBeUndefined()
    expect(doc3.persons[cId]).toBeDefined()
  })

  it('子のいない夫婦の家族は、無関係な人物の削除では残る', () => {
    const { doc, personId: aId } = withPerson('A')
    const { doc: doc2, familyId } = addSpouse(doc, aId, { name: { given: 'B' } })
    const { doc: doc3, personId: zId } = addPerson(doc2, { name: { given: 'Z' } })

    const doc4 = removePerson(doc3, zId)
    expect(doc4.families[familyId].spouseIds).toHaveLength(2)
  })

  it('無関係な配偶者1人・子0人の家族を巻き添えで削除しない', () => {
    const { doc, personId: aId } = withPerson('A')
    const { doc: doc2, personId: zId } = addPerson(doc, { name: { given: 'Z' } })
    // 読み込み時の自動修復は行わないため、こうした家族は削除されるまで残り続ける
    const vacant = createFamily({ spouseIds: [aId] })
    const doc3 = putFamilyRaw(doc2, vacant)

    const doc4 = removePerson(doc3, zId)
    expect(doc4.families[vacant.id]).toBeDefined()
  })
})

describe('computeRemovalImpact: 予告と実行の一致', () => {
  it('予告した削除件数と実際に削除された家族数が一致する', () => {
    // A-B(子なし)、A-C(子D)、Dの配偶者Eの3家族を持つドキュメント
    const { doc, personId: aId } = withPerson('A')
    const { doc: doc2 } = addSpouse(doc, aId, { name: { given: 'B' } })
    const { doc: doc3, spouseId: cId } = addSpouse(doc2, aId, { name: { given: 'C' } })
    const { doc: doc4, childId: dId } = addChild(doc3, aId, { name: { given: 'D' } }, {
      otherParentId: cId,
    })
    const { doc: doc5 } = addSpouse(doc4, dId, { name: { given: 'E' } })

    for (const personId of [aId, cId, dId]) {
      const impact = computeRemovalImpact(doc5, personId)
      const before = Object.keys(doc5.families).length
      const after = Object.keys(removePerson(doc5, personId).families).length
      expect(before - after).toBe(impact.removedFamilyCount)
    }
  })

  it('削除で失われる婚姻・離婚イベントの件数を返す', () => {
    const { doc, personId: aId } = withPerson('A')
    const { doc: doc2, spouseId: bId, familyId } = addSpouse(doc, aId, { name: { given: 'B' } })
    const doc3 = setFamilyEvent(doc2, familyId, 'marriage', { type: 'marriage' })

    // 家族ごと削除されるため婚姻の記録も失われる
    expect(computeRemovalImpact(doc3, bId).removedFamilyEventCount).toBe(1)
  })

  it('家族が削除されない場合はイベント件数を0で返す', () => {
    const { doc, personId: aId } = withPerson('A')
    const { doc: doc2, spouseId: bId, familyId } = addSpouse(doc, aId, { name: { given: 'B' } })
    const doc3 = setFamilyEvent(doc2, familyId, 'marriage', { type: 'marriage' })
    const { doc: doc4 } = addChild(doc3, aId, { name: { given: 'C' } }, { otherParentId: bId })

    const impact = computeRemovalImpact(doc4, bId)
    expect(impact.removedFamilyCount).toBe(0)
    expect(impact.removedFamilyEventCount).toBe(0)
  })
})

describe('addSpouseLink: 既存人物を既存家族の配偶者にする', () => {
  /** 子Cに親Pを登録し、Pに配偶者Qを別家族として作った「分裂」状態を作る */
  function splitFamilies() {
    const { doc, personId: cId } = withPerson('C')
    const { doc: doc2, parentId: pId, familyId: parentFamilyId } = addParent(doc, cId, {
      name: { given: 'P' },
    })
    const { doc: doc3, spouseId: qId, familyId: spouseFamilyId } = addSpouse(doc2, pId, {
      name: { given: 'Q' },
    })
    return { doc: doc3, cId, pId, qId, parentFamilyId, spouseFamilyId }
  }

  it('配偶者1人の家族へ既存人物を追加すると2人になり、子が両者の子になる', () => {
    const { doc, cId, pId, qId, parentFamilyId } = splitFamilies()

    const next = addSpouseLink(doc, parentFamilyId, qId)
    expect(next.families[parentFamilyId].spouseIds).toEqual([pId, qId])
    expect(next.families[parentFamilyId].children.map((c) => c.childId)).toEqual([cId])
  })

  it('既に配偶者である人物を再度追加してもドキュメントは変化しない', () => {
    const { doc, qId, spouseFamilyId } = splitFamilies()

    expect(addSpouseLink(doc, spouseFamilyId, qId)).toEqual(doc)
  })

  it('配偶者が既に2人の家族へは追加できない', () => {
    const { doc, spouseFamilyId } = splitFamilies()
    const { doc: doc2, personId: rId } = addPerson(doc, { name: { given: 'R' } })

    expect(() => addSpouseLink(doc2, spouseFamilyId, rId)).toThrow()
  })

  it('その家族の子は配偶者にできない', () => {
    const { doc, cId, parentFamilyId } = splitFamilies()

    expect(() => addSpouseLink(doc, parentFamilyId, cId)).toThrow()
  })

  it('存在しない家族・人物を指定すると例外になる', () => {
    const { doc, qId, parentFamilyId } = splitFamilies()

    expect(() => addSpouseLink(doc, 'missing-family', qId)).toThrow()
    expect(() => addSpouseLink(doc, parentFamilyId, 'missing-person')).toThrow()
  })

  it('元のドキュメントを変更しない(純関数)', () => {
    const { doc, qId, parentFamilyId } = splitFamilies()
    const before: TreeDocument = structuredClone(doc)

    addSpouseLink(doc, parentFamilyId, qId)
    expect(doc).toEqual(before)
  })
})

describe('addSpouse: 既存家族への自動合流は行わない', () => {
  it('ひとり親家族を持つ人物へ配偶者を追加しても新しい家族が作られる', () => {
    const { doc, personId: cId } = withPerson('C')
    const { doc: doc2, parentId: pId, familyId: parentFamilyId } = addParent(doc, cId, {
      name: { given: 'P' },
    })
    const { doc: doc3, spouseId: qId, familyId: spouseFamilyId } = addSpouse(doc2, pId, {
      name: { given: 'Q' },
    })

    expect(spouseFamilyId).not.toBe(parentFamilyId)
    // 継親・後妻を子の親として勝手に記録しない
    expect(doc3.families[parentFamilyId].spouseIds).toEqual([pId])
    expect(doc3.families[spouseFamilyId].spouseIds).toEqual([pId, qId])
    expect(doc3.families[spouseFamilyId].children).toEqual([])
    expect(qId).toBeDefined()
  })
})

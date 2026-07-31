import { describe, expect, it } from 'vitest'
import {
  addChild,
  addChildLink,
  addFamilyEvent,
  addParent,
  addPerson,
  addSpouse,
  addSpouseLink,
  bulkUpsertPersons,
  collectAncestors,
  collectDescendants,
  computeRemovalImpact,
  computeUnlinkImpact,
  isUnconnectedPerson,
  linkChild,
  linkParent,
  linkSpouse,
  removeFamily,
  removePerson,
  setChildPedigree,
  setFamilyEvent,
  unlinkChild,
  unlinkSpouse,
  updateFamily,
  updatePerson,
  wouldCreateAncestryCycle,
} from './commands'
import { createFamily, createTreeDocument } from './helpers'
import type { LifeEvent, TreeDocument } from './types'

function withPerson(name: string) {
  let doc = createTreeDocument()
  const { doc: doc2, personId } = addPerson(doc, { name: { given: name } })
  doc = doc2
  return { doc, personId }
}

describe('addPerson / addSpouse', () => {
  it('人物追加後に配偶者を追加すると家族が新設される', () => {
    const { doc, personId: aId } = withPerson('A')
    const {
      doc: doc2,
      spouseId: bId,
      familyId,
    } = addSpouse(doc, aId, { name: { given: 'B' } })
    expect(doc2.persons[bId]).toBeDefined()
    expect(doc2.families[familyId].spouseIds.sort()).toEqual([aId, bId].sort())
  })

  it('再婚: 同一人物に2つ目のFamilyを追加でき、1つ目は残る', () => {
    const { doc, personId: aId } = withPerson('A')
    const { doc: doc2, familyId: f1 } = addSpouse(doc, aId, {
      name: { given: 'B' },
    })
    const { doc: doc3, familyId: f2 } = addSpouse(doc2, aId, {
      name: { given: 'C' },
    })
    expect(f1).not.toBe(f2)
    expect(doc3.families[f1]).toBeDefined()
    expect(doc3.families[f2]).toBeDefined()
    const aFamilies = Object.values(doc3.families).filter((f) =>
      f.spouseIds.includes(aId),
    )
    expect(aFamilies).toHaveLength(2)
  })
})

describe('addChild', () => {
  it('婚姻関係にある2人の家族へ実子として帰属する', () => {
    const { doc, personId: aId } = withPerson('A')
    const {
      doc: doc2,
      spouseId: bId,
      familyId: f1,
    } = addSpouse(doc, aId, {
      name: { given: 'B' },
    })
    const {
      doc: doc3,
      childId,
      familyId,
    } = addChild(
      doc2,
      aId,
      { name: { given: 'C' } },
      {
        otherParentId: bId,
      },
    )
    expect(familyId).toBe(f1)
    expect(doc3.families[f1].children).toEqual([
      { childId, pedigree: 'biological' },
    ])
  })

  it('ひとり親の家族へ子を追加でき、家族がなければ新設される', () => {
    const { doc, personId: aId } = withPerson('A')
    const {
      doc: doc2,
      childId,
      familyId,
    } = addChild(doc, aId, { name: { given: 'D' } })
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
    doc = {
      ...doc,
      families: {
        ...doc.families,
        [adoptiveFamilyId]: { ...doc.families[adoptiveFamilyId], children: [] },
      },
    }

    doc = addChildLink(doc, adoptiveFamilyId, childId, 'adopted')

    expect(doc.families[bioFamilyId].children).toEqual([
      { childId, pedigree: 'biological' },
    ])
    expect(doc.families[adoptiveFamilyId].children).toEqual([
      { childId, pedigree: 'adopted' },
    ])

    doc = setChildPedigree(doc, bioFamilyId, childId, 'adopted')
    expect(doc.families[bioFamilyId].children[0].pedigree).toBe('adopted')
  })
})

describe('addParent', () => {
  it('親未登録の人物に親を追加すると家族が新設される', () => {
    const { doc, personId: childId } = withPerson('D')
    const {
      doc: doc2,
      parentId,
      familyId,
    } = addParent(doc, childId, { name: { given: '親' } })
    expect(doc2.families[familyId].spouseIds).toEqual([parentId])
    expect(doc2.families[familyId].children).toEqual([
      { childId, pedigree: 'biological' },
    ])
  })

  it('既存のひとり親家族に2人目の親が加わる', () => {
    const { doc, personId: childId } = withPerson('D')
    const {
      doc: doc2,
      parentId: p1,
      familyId: f1,
    } = addParent(doc, childId, {
      name: { given: '親1' },
    })
    const {
      doc: doc3,
      parentId: p2,
      familyId: f2,
    } = addParent(doc2, childId, {
      name: { given: '親2' },
    })
    expect(f2).toBe(f1)
    expect(doc3.families[f1].spouseIds.sort()).toEqual([p1, p2].sort())
  })
})

describe('addFamilyEvent: 復縁', () => {
  it('同一Familyへ婚姻→離婚→婚姻の順でイベントを追記できる', () => {
    const { doc, personId: aId } = withPerson('A')
    const { doc: doc2, familyId } = addSpouse(doc, aId, {
      name: { given: 'B' },
    })
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
    const { doc: doc2, familyId } = addSpouse(doc, aId, {
      name: { given: 'B' },
    })
    const d = setFamilyEvent(doc2, familyId, 'marriage', {
      type: 'marriage',
      place: '東京',
    })
    expect(d.families[familyId].events).toEqual([
      { type: 'marriage', place: '東京' },
    ])
  })

  it('該当種別の最初の1件を置換する', () => {
    const { doc, personId: aId } = withPerson('A')
    const { doc: doc2, familyId } = addSpouse(doc, aId, {
      name: { given: 'B' },
    })
    let d = addFamilyEvent(doc2, familyId, {
      type: 'marriage',
      place: '旧住所',
    })
    d = setFamilyEvent(d, familyId, 'marriage', {
      type: 'marriage',
      place: '新住所',
    })
    expect(d.families[familyId].events).toEqual([
      { type: 'marriage', place: '新住所' },
    ])
  })

  it('undefinedを指定すると該当種別のイベントを削除する(他の種別は影響を受けない)', () => {
    const { doc, personId: aId } = withPerson('A')
    const { doc: doc2, familyId } = addSpouse(doc, aId, {
      name: { given: 'B' },
    })
    let d = addFamilyEvent(doc2, familyId, { type: 'marriage' })
    d = addFamilyEvent(d, familyId, { type: 'divorce' })
    d = setFamilyEvent(d, familyId, 'marriage', undefined)
    expect(d.families[familyId].events).toEqual([{ type: 'divorce' }])
  })

  it('復縁(3件以上のイベント)がある場合、最初の1件のみを対象にしそれ以外は保持する', () => {
    const { doc, personId: aId } = withPerson('A')
    const { doc: doc2, familyId } = addSpouse(doc, aId, {
      name: { given: 'B' },
    })
    let d = addFamilyEvent(doc2, familyId, { type: 'marriage', place: '1回目' })
    d = addFamilyEvent(d, familyId, { type: 'divorce' })
    d = addFamilyEvent(d, familyId, { type: 'marriage', place: '2回目' })
    d = setFamilyEvent(d, familyId, 'marriage', {
      type: 'marriage',
      place: '1回目修正',
    })
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
    const {
      doc: doc2,
      spouseId: bId,
      familyId,
    } = addSpouse(doc, aId, { name: { given: 'B' } })
    const { doc: doc3, childId } = addChild(
      doc2,
      aId,
      { name: { given: 'C' } },
      {
        otherParentId: bId,
      },
    )

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
    const { doc: doc2, spouseId: bId } = addSpouse(doc, aId, {
      name: { given: 'B' },
    })
    const before: TreeDocument = structuredClone(doc2)
    const doc3 = removePerson(doc2, bId)
    expect(doc3).not.toEqual(before)
    // undoはストア側の責務(4章)。ここではコマンドが元のdocを変更しない(純関数)ことのみ確認
    expect(doc2).toEqual(before)
  })
})

describe('removePerson: 意味を持たない家族を残さない', () => {
  /** 手動で家族を差し込む(インポート等でしか生じない形を再現するため) */
  function putFamilyRaw(
    doc: TreeDocument,
    family: ReturnType<typeof createFamily>,
  ): TreeDocument {
    return { ...doc, families: { ...doc.families, [family.id]: family } }
  }

  it('子のいない夫婦の片方を削除すると家族ごと削除される', () => {
    const { doc, personId: aId } = withPerson('A')
    const {
      doc: doc2,
      spouseId: bId,
      familyId,
    } = addSpouse(doc, aId, { name: { given: 'B' } })

    const doc3 = removePerson(doc2, bId)
    // 配偶者Aだけが残った空の家族は保持しない
    expect(doc3.families[familyId]).toBeUndefined()
    expect(doc3.persons[aId]).toBeDefined()
  })

  it('子のいる夫婦の片方を削除するとひとり親家族として残る', () => {
    const { doc, personId: aId } = withPerson('A')
    const {
      doc: doc2,
      spouseId: bId,
      familyId,
    } = addSpouse(doc, aId, { name: { given: 'B' } })
    const { doc: doc3, childId } = addChild(
      doc2,
      aId,
      { name: { given: 'C' } },
      {
        otherParentId: bId,
      },
    )

    const doc4 = removePerson(doc3, bId)
    expect(doc4.families[familyId].spouseIds).toEqual([aId])
    expect(doc4.families[familyId].children.map((c) => c.childId)).toEqual([
      childId,
    ])
  })

  it('配偶者が誰もいなくなった家族は子がいても削除され、子は人物として残る', () => {
    const { doc, personId: cId } = withPerson('C')
    const {
      doc: doc2,
      parentId: pId,
      familyId,
    } = addParent(doc, cId, { name: { given: 'P' } })

    const doc3 = removePerson(doc2, pId)
    expect(doc3.families[familyId]).toBeUndefined()
    expect(doc3.persons[cId]).toBeDefined()
  })

  it('子のいない夫婦の家族は、無関係な人物の削除では残る', () => {
    const { doc, personId: aId } = withPerson('A')
    const { doc: doc2, familyId } = addSpouse(doc, aId, {
      name: { given: 'B' },
    })
    const { doc: doc3, personId: zId } = addPerson(doc2, {
      name: { given: 'Z' },
    })

    const doc4 = removePerson(doc3, zId)
    expect(doc4.families[familyId].spouseIds).toHaveLength(2)
  })

  it('無関係な配偶者1人・子0人の家族を巻き添えで削除しない', () => {
    const { doc, personId: aId } = withPerson('A')
    const { doc: doc2, personId: zId } = addPerson(doc, {
      name: { given: 'Z' },
    })
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
    const { doc: doc3, spouseId: cId } = addSpouse(doc2, aId, {
      name: { given: 'C' },
    })
    const { doc: doc4, childId: dId } = addChild(
      doc3,
      aId,
      { name: { given: 'D' } },
      {
        otherParentId: cId,
      },
    )
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
    const {
      doc: doc2,
      spouseId: bId,
      familyId,
    } = addSpouse(doc, aId, { name: { given: 'B' } })
    const doc3 = setFamilyEvent(doc2, familyId, 'marriage', {
      type: 'marriage',
    })

    // 家族ごと削除されるため婚姻の記録も失われる
    expect(computeRemovalImpact(doc3, bId).removedFamilyEventCount).toBe(1)
  })

  it('家族が削除されない場合はイベント件数を0で返す', () => {
    const { doc, personId: aId } = withPerson('A')
    const {
      doc: doc2,
      spouseId: bId,
      familyId,
    } = addSpouse(doc, aId, { name: { given: 'B' } })
    const doc3 = setFamilyEvent(doc2, familyId, 'marriage', {
      type: 'marriage',
    })
    const { doc: doc4 } = addChild(
      doc3,
      aId,
      { name: { given: 'C' } },
      { otherParentId: bId },
    )

    const impact = computeRemovalImpact(doc4, bId)
    expect(impact.removedFamilyCount).toBe(0)
    expect(impact.removedFamilyEventCount).toBe(0)
  })
})

describe('addSpouseLink: 既存人物を既存家族の配偶者にする', () => {
  /** 子Cに親Pを登録し、Pに配偶者Qを別家族として作った「分裂」状態を作る */
  function splitFamilies() {
    const { doc, personId: cId } = withPerson('C')
    const {
      doc: doc2,
      parentId: pId,
      familyId: parentFamilyId,
    } = addParent(doc, cId, {
      name: { given: 'P' },
    })
    const {
      doc: doc3,
      spouseId: qId,
      familyId: spouseFamilyId,
    } = addSpouse(doc2, pId, {
      name: { given: 'Q' },
    })
    return { doc: doc3, cId, pId, qId, parentFamilyId, spouseFamilyId }
  }

  it('配偶者1人の家族へ既存人物を追加すると2人になり、子が両者の子になる', () => {
    const { doc, cId, pId, qId, parentFamilyId, spouseFamilyId } =
      splitFamilies()

    const next = addSpouseLink(doc, parentFamilyId, qId)

    // 同じ夫婦の家族が二重にならないよう、既存のP・Qの家族へ統合される
    expect(next.families[parentFamilyId]).toBeUndefined()
    expect(next.families[spouseFamilyId].spouseIds).toEqual([pId, qId])
    expect(
      next.families[spouseFamilyId].children.map((c) => c.childId),
    ).toEqual([cId])
    expect(
      Object.values(next.families).filter((f) => f.spouseIds.includes(pId)),
    ).toHaveLength(1)
  })

  it('統合先の家族に既に子がいる場合、双方の子が1つの家族へ集まる', () => {
    const { doc, cId, pId, qId, parentFamilyId, spouseFamilyId } =
      splitFamilies()
    // P・Qの家族側にも子Dを登録し、子が2つの家族に分かれた状態を作る
    const d = addChild(
      doc,
      pId,
      { name: { given: 'D' } },
      { otherParentId: qId },
    )

    const next = addSpouseLink(d.doc, parentFamilyId, qId)

    expect(next.families[parentFamilyId]).toBeUndefined()
    expect(
      next.families[spouseFamilyId].children.map((c) => c.childId).sort(),
    ).toEqual([cId, d.childId].sort())
  })

  it('統合しても婚姻・離婚の記録は失われず、同じ記録が二重にならない', () => {
    const { doc, qId, parentFamilyId, spouseFamilyId } = splitFamilies()
    const marriage: LifeEvent<'marriage'> = {
      type: 'marriage',
      date: {
        original: '明治36年1月26日',
        qualifier: 'exact',
        date: { year: 1903, month: 1, day: 26 },
      },
    }
    // 同じ婚姻が両方の家族に記録され、片方にだけ離婚が記録されている状態
    let split = setFamilyEvent(doc, parentFamilyId, 'marriage', marriage)
    split = setFamilyEvent(split, spouseFamilyId, 'marriage', marriage)
    split = setFamilyEvent(split, parentFamilyId, 'divorce', {
      type: 'divorce',
    })

    const next = addSpouseLink(split, parentFamilyId, qId)

    const events = next.families[spouseFamilyId].events
    expect(events.filter((e) => e.type === 'marriage')).toEqual([marriage])
    expect(events.filter((e) => e.type === 'divorce')).toHaveLength(1)
  })

  it('相手側もひとり親の家族なら、同じ夫婦の家族とはみなさず統合しない', () => {
    const { doc, personId: cId } = withPerson('C')
    const p = addParent(doc, cId, { name: { given: 'P' } })
    const q = addPerson(p.doc, { name: { given: 'Q' } })
    // Qにも子Dだけのひとり親の家族がある(配偶者はQ1人なのでP・Qの家族ではない)
    const d = addChild(q.doc, q.personId, { name: { given: 'D' } })

    const next = addSpouseLink(d.doc, p.familyId, q.personId)

    expect(next.families[p.familyId].spouseIds).toEqual([
      p.parentId,
      q.personId,
    ])
    expect(next.families[d.familyId].spouseIds).toEqual([q.personId])
    expect(next.families[d.familyId].children.map((c) => c.childId)).toEqual([
      d.childId,
    ])
  })

  it('統合先の関係種別が「不明」なら、統合元で判明している種別を引き継ぐ', () => {
    const { doc, qId, parentFamilyId, spouseFamilyId } = splitFamilies()
    const split = updateFamily(doc, parentFamilyId, { kind: 'married' })

    const next = addSpouseLink(split, parentFamilyId, qId)

    expect(next.families[spouseFamilyId].kind).toBe('married')
  })

  it('同じ夫婦の家族がない場合は従来どおりその家族へ配偶者が加わる', () => {
    const { doc, personId: cId } = withPerson('C')
    const p = addParent(doc, cId, { name: { given: 'P' } })
    const q = addPerson(p.doc, { name: { given: 'Q' } })

    const next = addSpouseLink(q.doc, p.familyId, q.personId)

    expect(next.families[p.familyId].spouseIds).toEqual([
      p.parentId,
      q.personId,
    ])
    expect(next.families[p.familyId].children.map((c) => c.childId)).toEqual([
      cId,
    ])
  })

  it('既に配偶者である人物を再度追加してもドキュメントは変化しない', () => {
    const { doc, qId, spouseFamilyId } = splitFamilies()

    expect(addSpouseLink(doc, spouseFamilyId, qId)).toEqual(doc)
  })

  it('配偶者が既に2人の家族へは追加できない', () => {
    const { doc, spouseFamilyId } = splitFamilies()
    const { doc: doc2, personId: rId } = addPerson(doc, {
      name: { given: 'R' },
    })

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
    const {
      doc: doc2,
      parentId: pId,
      familyId: parentFamilyId,
    } = addParent(doc, cId, {
      name: { given: 'P' },
    })
    const {
      doc: doc3,
      spouseId: qId,
      familyId: spouseFamilyId,
    } = addSpouse(doc2, pId, {
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

describe('collectAncestors: 全ての親家族をたどる祖先集合', () => {
  it('実親・養親の双方を持つ人物で両系統の祖先が返る', () => {
    let doc = createTreeDocument()
    const bioGrand = addPerson(doc, { name: { given: '実祖父' } })
    doc = bioGrand.doc
    const bioParent = addChild(doc, bioGrand.personId, {
      name: { given: '実父' },
    })
    doc = bioParent.doc
    const child = addChild(doc, bioParent.childId, { name: { given: '子' } })
    doc = child.doc

    const adoptGrand = addPerson(doc, { name: { given: '養祖母' } })
    doc = adoptGrand.doc
    const adoptParent = addChild(doc, adoptGrand.personId, {
      name: { given: '養母' },
    })
    doc = adoptParent.doc
    const adoptFamily = createFamily({
      spouseIds: [adoptParent.childId],
      children: [{ childId: child.childId, pedigree: 'adopted' }],
    })
    doc = {
      ...doc,
      families: { ...doc.families, [adoptFamily.id]: adoptFamily },
    }

    const ancestors = collectAncestors(doc, child.childId)
    expect([...ancestors].sort()).toEqual(
      [
        bioGrand.personId,
        bioParent.childId,
        adoptGrand.personId,
        adoptParent.childId,
      ].sort(),
    )
  })

  it('循環を含むドキュメントでも停止する', () => {
    const { doc, personId: aId } = withPerson('A')
    const r = addChild(doc, aId, { name: { given: 'B' } })
    const bId = r.childId
    // Bの子としてAを帰属させる循環を、コマンドを介さず直接作る(インポート由来の壊れたデータ相当)
    const cyclic = createFamily({
      spouseIds: [bId],
      children: [{ childId: aId, pedigree: 'biological' }],
    })
    const doc2 = {
      ...r.doc,
      families: { ...r.doc.families, [cyclic.id]: cyclic },
    }

    const ancestors = collectAncestors(doc2, aId)
    expect(ancestors.has(aId)).toBe(true)
    expect(ancestors.has(bId)).toBe(true)
  })
})

describe('linkSpouse: 既存人物同士を配偶者にする', () => {
  it('関係を持たない2人をリンクすると配偶者2件の家族が新設される', () => {
    let doc = createTreeDocument()
    const x = addPerson(doc, { name: { given: 'X' } })
    doc = x.doc
    const y = addPerson(doc, { name: { given: 'Y' } })
    doc = y.doc

    const { doc: next, familyId } = linkSpouse(doc, x.personId, y.personId)
    expect(next.families[familyId].spouseIds).toEqual([x.personId, y.personId])
    expect(Object.keys(next.families)).toHaveLength(1)
    expect(Object.keys(next.persons)).toHaveLength(2)
  })

  it('既存の婚姻・子の帰属には影響しない(再婚相当)', () => {
    const { doc, personId: aId } = withPerson('A')
    const b = addSpouse(doc, aId, { name: { given: 'B' } })
    const c = addChild(
      b.doc,
      aId,
      { name: { given: 'C' } },
      { otherParentId: b.spouseId },
    )
    const z = addPerson(c.doc, { name: { given: 'Z' } })

    const { doc: next, familyId } = linkSpouse(z.doc, aId, z.personId)
    expect(next.families[b.familyId].spouseIds).toEqual([aId, b.spouseId])
    expect(next.families[b.familyId].children).toHaveLength(1)
    expect(next.families[familyId].spouseIds).toEqual([aId, z.personId])
  })

  it('自分自身・既に配偶者である相手・存在しない人物を拒否する', () => {
    const { doc, personId: aId } = withPerson('A')
    const b = addSpouse(doc, aId, { name: { given: 'B' } })
    const before: TreeDocument = structuredClone(b.doc)

    expect(() => linkSpouse(b.doc, aId, aId)).toThrow()
    expect(() => linkSpouse(b.doc, aId, b.spouseId)).toThrow()
    expect(() => linkSpouse(b.doc, aId, 'missing-person')).toThrow()
    expect(b.doc).toEqual(before)
  })
})

describe('linkChild: 既存人物を子にする', () => {
  it('相方あり・相方なし・該当家族なしの3経路', () => {
    const { doc, personId: aId } = withPerson('A')
    const b = addSpouse(doc, aId, { name: { given: 'B' } })
    const x = addPerson(b.doc, { name: { given: 'X' } })

    // 相方あり: A-Bの既存家族へ帰属する
    const withOther = linkChild(x.doc, aId, x.personId, {
      otherParentId: b.spouseId,
    })
    expect(withOther.familyId).toBe(b.familyId)
    expect(withOther.doc.families[b.familyId].children).toEqual([
      { childId: x.personId, pedigree: 'biological' },
    ])

    // 該当家族なし: 配偶者1件の家族が存在しないため新設される
    const created = linkChild(x.doc, aId, x.personId)
    expect(created.familyId).not.toBe(b.familyId)
    expect(created.doc.families[created.familyId].spouseIds).toEqual([aId])

    // 相方なし + 配偶者1件の家族あり: その家族へ帰属する
    const solo = addChild(x.doc, aId, { name: { given: '既存子' } })
    const joined = linkChild(solo.doc, aId, x.personId)
    expect(joined.familyId).toBe(solo.familyId)
    expect(
      joined.doc.families[solo.familyId].children.map((c) => c.childId),
    ).toContain(x.personId)
  })

  it('対象人物の氏名・生没日は変化しない', () => {
    const { doc, personId: aId } = withPerson('A')
    const x = addPerson(doc, {
      name: { surname: '富岡', given: '榮' },
      birth: {
        type: 'birth',
        date: {
          original: '明治36年1月26日',
          qualifier: 'exact',
          date: { year: 1903, month: 1, day: 26 },
        },
      },
    })
    const { doc: next } = linkChild(x.doc, aId, x.personId)
    expect(next.persons[x.personId]).toEqual(x.doc.persons[x.personId])
  })

  it('既に他の家族の子である人物も帰属でき、続柄が区別される', () => {
    const { doc, personId: bioId } = withPerson('実親')
    const child = addChild(doc, bioId, { name: { given: 'D' } })
    const adoptive = addPerson(child.doc, { name: { given: '養親' } })

    const linked = linkChild(adoptive.doc, adoptive.personId, child.childId, {
      pedigree: 'adopted',
    })
    expect(linked.doc.families[child.familyId].children).toEqual([
      { childId: child.childId, pedigree: 'biological' },
    ])
    expect(linked.doc.families[linked.familyId].children).toEqual([
      { childId: child.childId, pedigree: 'adopted' },
    ])
  })

  it('再帰属では変化せず、配偶者本人と祖先は拒否される', () => {
    const { doc, personId: aId } = withPerson('A')
    const b = addSpouse(doc, aId, { name: { given: 'B' } })
    const c = addChild(
      b.doc,
      aId,
      { name: { given: 'C' } },
      { otherParentId: b.spouseId },
    )

    // 再帰属は変化なし
    const again = linkChild(c.doc, aId, c.childId, {
      otherParentId: b.spouseId,
    })
    expect(again.doc).toBe(c.doc)

    // 当該家族の配偶者は子にできない
    expect(() =>
      linkChild(c.doc, aId, b.spouseId, { otherParentId: b.spouseId }),
    ).toThrow()

    // 祖先は子にできない(Cの子としてAを帰属させようとする)
    expect(() => linkChild(c.doc, c.childId, aId)).toThrow()
  })
})

describe('linkParent: 既存人物を親にする', () => {
  it('ひとり親家族への合流と、家族の新設', () => {
    const { doc, personId: cId } = withPerson('C')
    const p = addParent(doc, cId, { name: { given: 'P' } })
    const q = addPerson(p.doc, { name: { given: 'Q' } })

    const joined = linkParent(q.doc, cId, q.personId)
    expect(joined.familyId).toBe(p.familyId)
    expect(joined.doc.families[p.familyId].spouseIds).toEqual([
      p.parentId,
      q.personId,
    ])

    const { doc: doc2, personId: dId } = withPerson('D')
    const r = addPerson(doc2, { name: { given: 'R' } })
    const created = linkParent(r.doc, dId, r.personId)
    expect(created.doc.families[created.familyId].spouseIds).toEqual([
      r.personId,
    ])
    expect(created.doc.families[created.familyId].children).toEqual([
      { childId: dId, pedigree: 'biological' },
    ])
  })

  it('世代方向の循環を拒否する(自己参照・直系祖先・養親経由)', () => {
    const { doc, personId: gId } = withPerson('G')
    const p = addChild(doc, gId, { name: { given: 'P' } })
    const c = addChild(p.doc, p.childId, { name: { given: 'C' } })

    expect(() => linkParent(c.doc, gId, gId)).toThrow()
    // Gの親としてCを指定すると、Cが自分自身の祖先になる
    expect(() => linkParent(c.doc, gId, c.childId)).toThrow()

    // 養親経由: DはPの養子。Pの実親Gの親としてDを指定すると循環になる
    const d = addPerson(c.doc, { name: { given: 'D' } })
    const adopted = linkChild(d.doc, p.childId, d.personId, {
      pedigree: 'adopted',
    })
    expect(() => linkParent(adopted.doc, gId, d.personId)).toThrow()
  })

  it('いとこ婚は許容される', () => {
    const { doc, personId: gId } = withPerson('祖父')
    const p1 = addChild(doc, gId, { name: { given: '長男' } })
    const p2 = addChild(p1.doc, gId, { name: { given: '次男' } })
    const x = addChild(p2.doc, p1.childId, { name: { given: 'X' } })
    const y = addChild(x.doc, p2.childId, { name: { given: 'Y' } })

    const { doc: next, familyId } = linkSpouse(y.doc, x.childId, y.childId)
    expect(next.families[familyId].spouseIds).toEqual([x.childId, y.childId])
  })
})

describe('unlinkChild / unlinkSpouse: 関係リンクの解除', () => {
  it('子リンクを外しても人物は残り、配偶者2件の家族は存続する', () => {
    const { doc, personId: aId } = withPerson('A')
    const b = addSpouse(doc, aId, { name: { given: 'B' } })
    const c = addChild(
      b.doc,
      aId,
      { name: { given: 'C' } },
      { otherParentId: b.spouseId },
    )

    const next = unlinkChild(c.doc, b.familyId, c.childId)
    expect(next.persons[c.childId]).toBeDefined()
    expect(next.families[b.familyId].children).toEqual([])
    expect(next.families[b.familyId].spouseIds).toEqual([aId, b.spouseId])
  })

  it('配偶者1件の家族から子を外すと家族ごと消え、人物は残る', () => {
    const { doc, personId: aId } = withPerson('A')
    const c = addChild(doc, aId, { name: { given: 'C' } })

    const next = unlinkChild(c.doc, c.familyId, c.childId)
    expect(next.families[c.familyId]).toBeUndefined()
    expect(next.persons[aId]).toBeDefined()
    expect(next.persons[c.childId]).toBeDefined()
  })

  it('子ありの家族から配偶者を外すとひとり親として存続し、子とイベントが維持される', () => {
    const { doc, personId: aId } = withPerson('A')
    const b = addSpouse(doc, aId, { name: { given: 'B' } })
    const c = addChild(
      b.doc,
      aId,
      { name: { given: 'C' } },
      { otherParentId: b.spouseId },
    )
    const withEvent = addFamilyEvent(c.doc, b.familyId, {
      type: 'marriage',
      place: '東京',
    })

    const next = unlinkSpouse(withEvent, b.familyId, b.spouseId)
    expect(next.families[b.familyId].spouseIds).toEqual([aId])
    expect(next.families[b.familyId].children.map((x) => x.childId)).toEqual([
      c.childId,
    ])
    expect(next.families[b.familyId].events).toHaveLength(1)
    expect(next.persons[b.spouseId]).toBeDefined()
  })

  it('子なしの家族から配偶者を外すと家族ごと消え、双方の人物は残る', () => {
    const { doc, personId: aId } = withPerson('A')
    const b = addSpouse(doc, aId, { name: { given: 'B' } })
    const withEvent = addFamilyEvent(b.doc, b.familyId, {
      type: 'marriage',
      place: '東京',
    })

    const next = unlinkSpouse(withEvent, b.familyId, b.spouseId)
    expect(next.families[b.familyId]).toBeUndefined()
    expect(next.persons[aId]).toBeDefined()
    expect(next.persons[b.spouseId]).toBeDefined()
  })

  it('対象でない関係の解除は変化なし、存在しない家族は throw', () => {
    const { doc, personId: aId } = withPerson('A')
    const b = addSpouse(doc, aId, { name: { given: 'B' } })

    expect(unlinkChild(b.doc, b.familyId, aId)).toBe(b.doc)
    expect(() => unlinkSpouse(b.doc, 'missing-family', aId)).toThrow()
  })

  it('元のドキュメントを変更しない(純関数)', () => {
    const { doc, personId: aId } = withPerson('A')
    const b = addSpouse(doc, aId, { name: { given: 'B' } })
    const before: TreeDocument = structuredClone(b.doc)

    unlinkSpouse(b.doc, b.familyId, b.spouseId)
    expect(b.doc).toEqual(before)
  })
})

describe('computeUnlinkImpact: 予告と実行の一致', () => {
  it('家族ごと削除される場合にイベント件数と巻き添えの子の件数を返す', () => {
    const { doc, personId: aId } = withPerson('A')
    const b = addSpouse(doc, aId, { name: { given: 'B' } })
    const withEvent = addFamilyEvent(b.doc, b.familyId, {
      type: 'marriage',
      date: {
        original: '昭和47年11月7日',
        qualifier: 'exact',
        date: { year: 1972, month: 11, day: 7 },
      },
    })

    const impact = computeUnlinkImpact(withEvent, b.familyId, {
      kind: 'spouse',
      personId: b.spouseId,
    })
    expect(impact.familyRemoved).toBe(true)
    expect(impact.removedFamilyEventCount).toBe(1)
    expect(impact.orphanedChildCount).toBe(0)
    expect(impact.becomesUnconnected).toBe(true)
  })

  it('家族が存続する場合はイベントを失わないと予告する', () => {
    const { doc, personId: aId } = withPerson('A')
    const b = addSpouse(doc, aId, { name: { given: 'B' } })
    const c = addChild(
      b.doc,
      aId,
      { name: { given: 'C' } },
      { otherParentId: b.spouseId },
    )
    const withEvent = addFamilyEvent(c.doc, b.familyId, {
      type: 'marriage',
      place: '東京',
    })

    const impact = computeUnlinkImpact(withEvent, b.familyId, {
      kind: 'spouse',
      personId: b.spouseId,
    })
    expect(impact.familyRemoved).toBe(false)
    expect(impact.removedFamilyEventCount).toBe(0)
    expect(impact.becomesUnconnected).toBe(true)
  })

  it('他に関係が残る人物は未接続にならないと予告する', () => {
    const { doc, personId: aId } = withPerson('A')
    const b = addSpouse(doc, aId, { name: { given: 'B' } })
    const c = addChild(
      b.doc,
      aId,
      { name: { given: 'C' } },
      { otherParentId: b.spouseId },
    )
    const second = addSpouse(c.doc, b.spouseId, { name: { given: 'B2' } })

    const impact = computeUnlinkImpact(second.doc, b.familyId, {
      kind: 'spouse',
      personId: b.spouseId,
    })
    expect(impact.becomesUnconnected).toBe(false)
  })

  it('予告した家族削除の有無と実行結果の家族数の差が一致する', () => {
    const { doc, personId: aId } = withPerson('A')
    const b = addSpouse(doc, aId, { name: { given: 'B' } })
    const c = addChild(b.doc, aId, { name: { given: 'C' } })
    const cases: {
      familyId: string
      target: { kind: 'child' | 'spouse'; personId: string }
    }[] = [
      {
        familyId: b.familyId,
        target: { kind: 'spouse', personId: b.spouseId },
      },
      { familyId: c.familyId, target: { kind: 'child', personId: c.childId } },
      { familyId: c.familyId, target: { kind: 'spouse', personId: aId } },
    ]

    for (const { familyId, target } of cases) {
      const impact = computeUnlinkImpact(c.doc, familyId, target)
      const next =
        target.kind === 'child'
          ? unlinkChild(c.doc, familyId, target.personId)
          : unlinkSpouse(c.doc, familyId, target.personId)
      const removed =
        Object.keys(c.doc.families).length - Object.keys(next.families).length
      expect(removed).toBe(impact.familyRemoved ? 1 : 0)
    }
  })
})

describe('役割の取り違えの修正: 子として登録した人物を配偶者へ繋ぎ変える', () => {
  it('人物データを失わずに繋ぎ変えられる', () => {
    const { doc, personId: aId } = withPerson('A')
    // 誤って「子を追加」で登録してしまった(実際はAの配偶者)
    const c = addChild(doc, aId, {
      name: { surname: '山田', given: '花子', surnameKana: 'やまだ' },
      birth: {
        type: 'birth',
        date: {
          original: '昭和39年10月10日',
          qualifier: 'exact',
          date: { year: 1964, month: 10, day: 10 },
        },
      },
      note: 'メモ',
    })
    const original = c.doc.persons[c.childId]

    const detached = unlinkChild(c.doc, c.familyId, c.childId)
    expect(isUnconnectedPerson(detached, c.childId)).toBe(true)

    const { doc: fixed, familyId } = linkSpouse(detached, aId, c.childId)
    expect(fixed.families[familyId].spouseIds).toEqual([aId, c.childId])
    expect(fixed.persons[c.childId]).toEqual(original)
  })
})

describe('linkParent: 親が既に持つ家族への合流(婿養子)', () => {
  /**
   * 富岡徳雄・ぎん夫婦に実子 榮 がいて、榮 の夫 兎一 が齋藤家の実子。
   * この 兎一 を徳雄・ぎんの養子として記録する場面(婿養子)
   */
  function mukoyoshi() {
    let doc = createTreeDocument()
    const tokuo = addPerson(doc, { name: { surname: '富岡', given: '徳雄' } })
    doc = tokuo.doc
    const gin = addSpouse(doc, tokuo.personId, { name: { given: 'ぎん' } })
    doc = gin.doc
    const sakae = addChild(
      doc,
      tokuo.personId,
      { name: { surname: '富岡', given: '榮' } },
      {
        otherParentId: gin.spouseId,
      },
    )
    doc = sakae.doc

    const kihachiro = addPerson(doc, {
      name: { surname: '齋藤', given: '喜八郎' },
    })
    doc = kihachiro.doc
    const kiyo = addSpouse(doc, kihachiro.personId, { name: { given: 'きよ' } })
    doc = kiyo.doc
    const taichi = addChild(
      doc,
      kihachiro.personId,
      { name: { surname: '齋藤', given: '兎一' } },
      {
        otherParentId: kiyo.spouseId,
      },
    )
    doc = taichi.doc
    doc = linkSpouse(doc, taichi.childId, sakae.childId).doc

    return {
      doc,
      tokuoId: tokuo.personId,
      ginId: gin.spouseId,
      tokuoFamilyId: gin.familyId,
      sakaeId: sakae.childId,
      taichiId: taichi.childId,
      saitoFamilyId: taichi.familyId,
    }
  }

  it('親が配偶者として属する家族が1件なら、その家族の子として加える', () => {
    const { doc, tokuoId, ginId, tokuoFamilyId, taichiId, sakaeId } =
      mukoyoshi()

    const { doc: next, familyId } = linkParent(doc, taichiId, tokuoId)

    // 配偶者未登録の家族を新設せず、既存の徳雄・ぎんの家族へ加わる
    expect(familyId).toBe(tokuoFamilyId)
    expect(next.families[tokuoFamilyId].spouseIds).toEqual([tokuoId, ginId])
    expect(
      next.families[tokuoFamilyId].children.map((c) => c.childId).sort(),
    ).toEqual([sakaeId, taichiId].sort())
    // 徳雄が配偶者として属する家族は1件のまま(「(配偶者未登録)」の枠が生まれない)
    expect(
      Object.values(next.families).filter((f) => f.spouseIds.includes(tokuoId)),
    ).toHaveLength(1)
  })

  it('実親の家族はそのまま残り、両方の親家族に属する', () => {
    const { doc, tokuoId, taichiId, saitoFamilyId } = mukoyoshi()

    const { doc: next } = linkParent(doc, taichiId, tokuoId)

    expect(
      next.families[saitoFamilyId].children.map((c) => c.childId),
    ).toContain(taichiId)
    const asChild = Object.values(next.families).filter((f) =>
      f.children.some((c) => c.childId === taichiId),
    )
    expect(asChild).toHaveLength(2)
  })

  it('親に空き殻の家族が残っていても、唯一の婚姻の家族へ子として加わる', () => {
    const { doc, tokuoId, ginId, tokuoFamilyId, taichiId } = mukoyoshi()
    // 旧バージョンが残した空き殻(配偶者1件・子0件)。読み込み時に自動修復しないため残りうる
    const withShell: TreeDocument = {
      ...doc,
      families: {
        ...doc.families,
        shell: {
          id: 'shell',
          spouseIds: [tokuoId],
          kind: 'unknown',
          events: [],
          children: [],
        },
      },
    }

    const { doc: next, familyId } = linkParent(withShell, taichiId, tokuoId)

    // 空き殻の存在で家族が2件に数えられ、配偶者不在の家族が新設されてはならない
    expect(familyId).toBe(tokuoFamilyId)
    expect(next.families[tokuoFamilyId].spouseIds).toEqual([tokuoId, ginId])
    expect(
      next.families[tokuoFamilyId].children.map((c) => c.childId),
    ).toContain(taichiId)
    expect(
      Object.values(next.families).filter((f) => f.spouseIds.includes(tokuoId)),
    ).toHaveLength(2)
  })

  it('親がひとり親の家族も持つ場合、唯一の婚姻の家族が帰属先になる', () => {
    const { doc, tokuoId, tokuoFamilyId, taichiId } = mukoyoshi()
    // 徳雄に、もう一方の親が不明なひとり親の家族(子=X)がある状態
    const x = addPerson(doc, { name: { given: 'X' } })
    const solo = linkChild(x.doc, tokuoId, x.personId)

    const { doc: next, familyId } = linkParent(solo.doc, taichiId, tokuoId)

    expect(familyId).toBe(tokuoFamilyId)
    expect(next.families[solo.familyId].children.map((c) => c.childId)).toEqual(
      [x.personId],
    )
  })

  it('子のひとり親家族へ親を加えるとき、その2人の家族が既にあれば1件へ統合される', () => {
    const { doc, tokuoId, ginId, tokuoFamilyId, taichiId } = mukoyoshi()
    // 「徳雄のみを配偶者とする家族」に子 兎一 が記録された分裂状態を作る
    const split = linkChild(doc, tokuoId, taichiId)
    expect(split.familyId).not.toBe(tokuoFamilyId)

    const { doc: next, familyId } = linkParent(split.doc, taichiId, ginId)

    expect(familyId).toBe(tokuoFamilyId)
    expect(next.families[split.familyId]).toBeUndefined()
    expect(next.families[tokuoFamilyId].spouseIds).toEqual([tokuoId, ginId])
    expect(
      next.families[tokuoFamilyId].children.map((c) => c.childId),
    ).toContain(taichiId)
    // 徳雄・ぎんの家族は1件のまま(同じ夫婦の家族が二重にならない)
    expect(
      Object.values(next.families).filter((f) => f.spouseIds.includes(tokuoId)),
    ).toHaveLength(1)
  })

  it('親が複数の家族を持つ場合は推測せず、その親だけの家族を新設する', () => {
    const { doc, tokuoId, taichiId, tokuoFamilyId } = mukoyoshi()
    // 徳雄に2つ目の婚姻(再婚)を作ると、どちらの家族の子か決められない
    const second = addSpouse(doc, tokuoId, { name: { given: '後妻' } })

    const { doc: next, familyId } = linkParent(second.doc, taichiId, tokuoId)

    expect(familyId).not.toBe(tokuoFamilyId)
    expect(familyId).not.toBe(second.familyId)
    expect(next.families[familyId].spouseIds).toEqual([tokuoId])
    // 既存の2つの家族は変化しない
    expect(
      next.families[tokuoFamilyId].children.map((c) => c.childId),
    ).not.toContain(taichiId)
    expect(next.families[second.familyId].children).toEqual([])
  })

  it('子側にひとり親の家族がある場合は従来どおりそちらへ2人目の配偶者として加わる', () => {
    const { doc, personId: cId } = withPerson('C')
    const p = addParent(doc, cId, { name: { given: 'P' } })
    const q = addPerson(p.doc, { name: { given: 'Q' } })

    const { doc: next, familyId } = linkParent(q.doc, cId, q.personId)

    expect(familyId).toBe(p.familyId)
    expect(next.families[p.familyId].spouseIds).toEqual([
      p.parentId,
      q.personId,
    ])
  })

  it('既にその家族の子である場合はドキュメントが変化しない', () => {
    const { doc, tokuoId, sakaeId } = mukoyoshi()
    expect(linkParent(doc, sakaeId, tokuoId).doc).toBe(doc)
  })

  it('既に親家族を持つ人物への2つ目の親家族は続柄「不明」で記録される', () => {
    const { doc, tokuoId, taichiId, tokuoFamilyId } = mukoyoshi()

    const { doc: next } = linkParent(doc, taichiId, tokuoId)

    // 実の親が2組いることになる「実子」は付けず、利用者が続柄を確定できるようにする
    const link = next.families[tokuoFamilyId].children.find(
      (c) => c.childId === taichiId,
    )
    expect(link?.pedigree).toBe('unknown')
  })

  it('親家族を持たない人物は従来どおり実子として記録される', () => {
    const { doc, personId: cId } = withPerson('C')
    const p = addPerson(doc, { name: { given: 'P' } })

    const { doc: next, familyId } = linkParent(p.doc, cId, p.personId)

    expect(next.families[familyId].children).toEqual([
      { childId: cId, pedigree: 'biological' },
    ])
  })

  it('linkChildでも、既に親家族を持つ人物は続柄「不明」で記録される', () => {
    const { doc, tokuoId, ginId, taichiId, tokuoFamilyId } = mukoyoshi()

    const { doc: next } = linkChild(doc, tokuoId, taichiId, {
      otherParentId: ginId,
    })

    const link = next.families[tokuoFamilyId].children.find(
      (c) => c.childId === taichiId,
    )
    expect(link?.pedigree).toBe('unknown')
  })

  it('linkChildで続柄を明示した場合はその値が優先される', () => {
    const { doc, tokuoId, ginId, taichiId, tokuoFamilyId } = mukoyoshi()

    const { doc: next } = linkChild(doc, tokuoId, taichiId, {
      otherParentId: ginId,
      pedigree: 'adopted',
    })

    const link = next.families[tokuoFamilyId].children.find(
      (c) => c.childId === taichiId,
    )
    expect(link?.pedigree).toBe('adopted')
  })
})

describe('linkParent: 配偶者と子を兼ねる矛盾の拒否(対称ガード)', () => {
  it('A–B夫婦でAの親としてBを指定すると拒否される(経路2: 家族の配偶者を子にしない)', () => {
    const { doc, personId: aId } = withPerson('A')
    const b = addSpouse(doc, aId, { name: { given: 'B' } })
    const before: TreeDocument = structuredClone(b.doc)

    expect(() => linkParent(b.doc, aId, b.spouseId)).toThrow(
      '家族の配偶者を子にはできません',
    )
    expect(b.doc).toEqual(before)
  })

  it('ひとり親Pの子C・DでCの親としてDを指定すると拒否される(経路1: 家族の子を配偶者にしない)', () => {
    const { doc, personId: cId } = withPerson('C')
    const p = addParent(doc, cId, { name: { given: 'P' } })
    const d = addChild(p.doc, p.parentId, { name: { given: 'D' } })

    expect(() => linkParent(d.doc, cId, d.childId)).toThrow(
      '家族の子を配偶者(親)にはできません',
    )
  })
})

describe('addChildLink: linkChildと同じ不変条件を守る', () => {
  it('家族の配偶者は子にできない', () => {
    const { doc, personId: aId } = withPerson('A')
    const b = addSpouse(doc, aId, { name: { given: 'B' } })

    expect(() => addChildLink(b.doc, b.familyId, aId, 'biological')).toThrow(
      '家族の配偶者を子にはできません',
    )
  })

  it('世代方向の循環になる帰属を拒否する(祖先を子にしない)', () => {
    const { doc, personId: gId } = withPerson('G')
    const p = addChild(doc, gId, { name: { given: 'P' } })
    const c = addChild(p.doc, p.childId, { name: { given: 'C' } })

    // Pがひとり親の家族へ、Pの祖先であるGを子として帰属させようとする
    expect(() => addChildLink(c.doc, c.familyId, gId, 'adopted')).toThrow(
      '世代方向の循環になるため子にできません',
    )
  })

  it('既にその家族の子である場合は従来どおり変化しない', () => {
    const { doc, personId: aId } = withPerson('A')
    const c = addChild(doc, aId, { name: { given: 'C' } })

    expect(addChildLink(c.doc, c.familyId, c.childId, 'biological')).toBe(c.doc)
  })
})

describe('addChild: 相方(otherParentId)の存在検証', () => {
  it('存在しないotherParentIdを指定すると例外になる', () => {
    const { doc, personId: aId } = withPerson('A')

    expect(() =>
      addChild(
        doc,
        aId,
        { name: { given: 'C' } },
        { otherParentId: 'missing-person' },
      ),
    ).toThrow('人物が見つかりません')
  })
})

describe('配偶者統合: 同じ夫婦のFamilyの二重登録を解消する', () => {
  /**
   * 子Cに親Pを登録(親家族)し、Pに配偶者Qを追加(婚姻イベント付きの婚姻だけの家族)した
   * 「同じ夫婦になる予定の家族が2つに分裂した」状態を作る
   */
  function splitWithEvent() {
    const { doc, personId: cId } = withPerson('C')
    const p = addParent(doc, cId, { name: { given: 'P' } })
    const q = addSpouse(p.doc, p.parentId, { name: { given: 'Q' } })
    const withEvent = setFamilyEvent(q.doc, q.familyId, 'marriage', {
      type: 'marriage',
      place: '東京',
    })
    return {
      doc: withEvent,
      cId,
      pId: p.parentId,
      qId: q.spouseId,
      parentFamilyId: p.familyId,
      spouseFamilyId: q.familyId,
    }
  }

  it('addSpouseLink: 合流後に婚姻だけの家族が統合され、イベントは引き継がれる', () => {
    const { doc, cId, pId, qId, parentFamilyId, spouseFamilyId } =
      splitWithEvent()

    const next = addSpouseLink(doc, parentFamilyId, qId)

    // `attachSpouse`は既に配偶者2人の家族(spouseFamilyId)を残し、
    // 追加対象の家族(parentFamilyId)の子・イベントをそこへ移す
    expect(next.families[parentFamilyId]).toBeUndefined()
    const merged = next.families[spouseFamilyId]
    expect(merged.spouseIds).toEqual([pId, qId])
    expect(merged.children.map((c) => c.childId)).toEqual([cId])
    expect(merged.events).toEqual([{ type: 'marriage', place: '東京' }])
    // P–Qの家族が1つだけになる
    const pqFamilies = Object.values(next.families).filter(
      (f) => f.spouseIds.includes(pId) && f.spouseIds.includes(qId),
    )
    expect(pqFamilies).toHaveLength(1)
  })

  it('linkParent(経路1): ひとり親家族への合流でも同様に統合される', () => {
    const { doc, cId, pId, qId, parentFamilyId, spouseFamilyId } =
      splitWithEvent()

    const { doc: next, familyId } = linkParent(doc, cId, qId)

    expect(familyId).toBe(spouseFamilyId)
    expect(next.families[parentFamilyId]).toBeUndefined()
    expect(next.families[spouseFamilyId].spouseIds).toEqual([pId, qId])
    expect(
      next.families[spouseFamilyId].children.map((c) => c.childId),
    ).toEqual([cId])
    expect(next.families[spouseFamilyId].events).toEqual([
      { type: 'marriage', place: '東京' },
    ])
  })

  it('イベントは「統合先(既に配偶者2人の家族)の分 → 吸収元(あとから加わった側)の分」の順に並ぶ', () => {
    const { doc, qId, parentFamilyId, spouseFamilyId } = splitWithEvent()
    const withOwnEvent = setFamilyEvent(doc, parentFamilyId, 'divorce', {
      type: 'divorce',
      place: '既存',
    })

    const next = addSpouseLink(withOwnEvent, parentFamilyId, qId)

    expect(next.families[spouseFamilyId].events).toEqual([
      { type: 'marriage', place: '東京' },
      { type: 'divorce', place: '既存' },
    ])
  })

  it('両方の家族に子がいる場合も統合し、双方の子の帰属を失わない(spec family-data-model「双方に子がいる家族の統合」)', () => {
    const { doc, cId, pId, qId, parentFamilyId, spouseFamilyId } =
      splitWithEvent()
    // 婚姻だけだった家族の側にも子Dを帰属させる
    const d = addPerson(doc, { name: { given: 'D' } })
    const withChild = addChildLink(
      d.doc,
      spouseFamilyId,
      d.personId,
      'biological',
    )

    const next = addSpouseLink(withChild, parentFamilyId, qId)

    expect(next.families[parentFamilyId]).toBeUndefined()
    const merged = next.families[spouseFamilyId]
    expect(merged.spouseIds).toEqual([pId, qId])
    expect(merged.children.map((c) => c.childId).sort()).toEqual(
      [cId, d.personId].sort(),
    )
  })

  it('元のドキュメントを変更しない(純関数)', () => {
    const { doc, parentFamilyId, qId } = splitWithEvent()
    const before: TreeDocument = structuredClone(doc)

    addSpouseLink(doc, parentFamilyId, qId)
    expect(doc).toEqual(before)
  })
})

describe('collectDescendants', () => {
  it('子・孫を推移的に集め、自分自身は含めない', () => {
    const { doc, personId: gId } = withPerson('G')
    const p = addChild(doc, gId, { name: { given: 'P' } })
    const c = addChild(p.doc, p.childId, { name: { given: 'C' } })

    expect([...collectDescendants(c.doc, gId)].sort()).toEqual(
      [p.childId, c.childId].sort(),
    )
    expect(collectDescendants(c.doc, c.childId).size).toBe(0)
    expect(collectDescendants(c.doc, gId).has(gId)).toBe(false)
  })

  it('養子経由の子孫もたどる', () => {
    const { doc, personId: aId } = withPerson('養親')
    const b = addPerson(doc, { name: { given: 'B' } })
    const adopted = linkChild(b.doc, aId, b.personId, { pedigree: 'adopted' })
    const grand = addChild(adopted.doc, b.personId, { name: { given: '孫' } })

    expect([...collectDescendants(grand.doc, aId)].sort()).toEqual(
      [b.personId, grand.childId].sort(),
    )
  })

  it('循環を含む壊れたデータでも停止する', () => {
    const { doc, personId: aId } = withPerson('A')
    const r = addChild(doc, aId, { name: { given: 'B' } })
    const bId = r.childId
    // Bの子としてAを帰属させる循環を、コマンドを介さず直接作る(インポート由来の壊れたデータ相当)
    const cyclic = createFamily({
      spouseIds: [bId],
      children: [{ childId: aId, pedigree: 'biological' }],
    })
    const doc2 = {
      ...r.doc,
      families: { ...r.doc.families, [cyclic.id]: cyclic },
    }

    const descendants = collectDescendants(doc2, aId)
    expect(descendants.has(bId)).toBe(true)
    expect(descendants.has(aId)).toBe(true)
  })

  it('UI契約: 候補Cを親にすると循環 ⇔ C === personId || 子孫集合に含まれる', () => {
    const { doc, personId: gId } = withPerson('G')
    const p = addChild(doc, gId, { name: { given: 'P' } })
    const c = addChild(p.doc, p.childId, { name: { given: 'C' } })
    const z = addPerson(c.doc, { name: { given: 'Z' } })
    const finalDoc = z.doc

    const everyone = Object.keys(finalDoc.persons)
    for (const personId of everyone) {
      const descendants = collectDescendants(finalDoc, personId)
      for (const candidate of everyone) {
        expect(wouldCreateAncestryCycle(finalDoc, candidate, personId)).toBe(
          candidate === personId || descendants.has(candidate),
        )
      }
    }
  })
})

describe('updatePerson', () => {
  it('部分更新ができ、指定しなかったフィールドは保持される', () => {
    const { doc, personId } = withPerson('太郎')
    const doc2 = updatePerson(doc, personId, { gender: 'male' })
    const doc3 = updatePerson(doc2, personId, { note: 'メモ' })

    expect(doc3.persons[personId].gender).toBe('male')
    expect(doc3.persons[personId].note).toBe('メモ')
    expect(doc3.persons[personId].name).toEqual({ given: '太郎' })
  })

  it('存在しない人物は例外になり、元のドキュメントを変更しない', () => {
    const { doc } = withPerson('太郎')
    const before: TreeDocument = structuredClone(doc)

    expect(() => updatePerson(doc, 'missing-person', { note: 'x' })).toThrow(
      '人物が見つかりません',
    )
    expect(doc).toEqual(before)
  })
})

describe('updateFamily', () => {
  it('kindを更新でき、他のフィールドは保持される', () => {
    const { doc, personId: aId } = withPerson('A')
    const b = addSpouse(doc, aId, { name: { given: 'B' } })

    const next = updateFamily(b.doc, b.familyId, { kind: 'married' })
    expect(next.families[b.familyId].kind).toBe('married')
    expect(next.families[b.familyId].spouseIds).toEqual([aId, b.spouseId])
  })

  it('eventsを更新できる', () => {
    const { doc, personId: aId } = withPerson('A')
    const b = addSpouse(doc, aId, { name: { given: 'B' } })

    const next = updateFamily(b.doc, b.familyId, {
      events: [{ type: 'marriage', place: '東京' }],
    })
    expect(next.families[b.familyId].events).toEqual([
      { type: 'marriage', place: '東京' },
    ])
  })

  it('存在しない家族は例外になる', () => {
    const { doc } = withPerson('A')
    expect(() =>
      updateFamily(doc, 'missing-family', { kind: 'married' }),
    ).toThrow('家族が見つかりません')
  })
})

describe('removeFamily', () => {
  it('家族だけを削除し、所属していた人物は残る', () => {
    const { doc, personId: aId } = withPerson('A')
    const b = addSpouse(doc, aId, { name: { given: 'B' } })

    const next = removeFamily(b.doc, b.familyId)
    expect(next.families[b.familyId]).toBeUndefined()
    expect(next.persons[aId]).toBeDefined()
    expect(next.persons[b.spouseId]).toBeDefined()
  })

  it('存在しない家族は例外になる', () => {
    const { doc } = withPerson('A')
    expect(() => removeFamily(doc, 'missing-family')).toThrow(
      '家族が見つかりません',
    )
  })

  it('元のドキュメントを変更しない(純関数)', () => {
    const { doc, personId: aId } = withPerson('A')
    const b = addSpouse(doc, aId, { name: { given: 'B' } })
    const before: TreeDocument = structuredClone(b.doc)

    removeFamily(b.doc, b.familyId)
    expect(b.doc).toEqual(before)
  })
})

describe('setChildPedigree: 対象の子がいない場合', () => {
  it('ドキュメントをそのまま返す(updatedAtも変えない)', () => {
    const { doc, personId: aId } = withPerson('A')
    const c = addChild(doc, aId, { name: { given: 'C' } })

    expect(
      setChildPedigree(c.doc, c.familyId, 'missing-child', 'adopted'),
    ).toBe(c.doc)
  })
})

describe('setFamilyEvent: 種別とイベント内容の食い違い防止', () => {
  it('typeとevent.typeの不一致は型エラーになる(一致していれば従来どおり動く)', () => {
    const { doc, personId: aId } = withPerson('A')
    const { doc: doc2, familyId } = addSpouse(doc, aId, {
      name: { given: 'B' },
    })

    // @ts-expect-error -- marriage指定でdivorceイベントは渡せない(型で不一致を防止する)
    setFamilyEvent(doc2, familyId, 'marriage', { type: 'divorce' })

    const d = setFamilyEvent(doc2, familyId, 'divorce', { type: 'divorce' })
    expect(d.families[familyId].events).toEqual([{ type: 'divorce' }])
  })
})

describe('bulkUpsertPersons: 複数セル操作の一括適用(spec person-table-editor「ペースト」)', () => {
  it('更新2件+追加1件が1回のドキュメント遷移で適用される', () => {
    let doc = createTreeDocument()
    const a = addPerson(doc, { name: { given: '太郎' } })
    doc = a.doc
    const b = addPerson(doc, { name: { given: '花子' } })
    doc = b.doc

    const result = bulkUpsertPersons(
      doc,
      [
        {
          personId: a.personId,
          patch: { name: { surname: '山田', given: '太郎' } },
        },
        { personId: b.personId, patch: { note: 'メモ' } },
      ],
      [{ name: { given: '次郎' } }],
    )

    expect(result.doc).not.toBe(doc)
    expect(result.doc.persons[a.personId].name.surname).toBe('山田')
    expect(result.doc.persons[b.personId].note).toBe('メモ')
    expect(result.addedPersonIds).toHaveLength(1)
    expect(result.doc.persons[result.addedPersonIds[0]].name.given).toBe('次郎')
    expect(Object.keys(result.doc.persons)).toHaveLength(3)
    // 入力のドキュメントは変更されない(純関数)
    expect(doc.persons[a.personId].name.surname).toBeUndefined()
  })

  it('全件が無変更で追加も無い場合は同一参照を返す(ストアのno-op検知に乗る)', () => {
    let doc = createTreeDocument()
    const a = addPerson(doc, {
      name: { surname: '山田', given: '太郎' },
      note: 'メモ',
    })
    doc = a.doc

    const result = bulkUpsertPersons(doc, [
      {
        personId: a.personId,
        patch: { name: { surname: '山田', given: '太郎' } },
      },
      { personId: a.personId, patch: { note: 'メモ' } },
    ])

    expect(result.doc).toBe(doc)
    expect(result.addedPersonIds).toEqual([])
  })

  it('存在しないpersonIdの更新はthrowする(updatePersonと同じ意味論)', () => {
    const doc = createTreeDocument()
    expect(() =>
      bulkUpsertPersons(doc, [{ personId: 'ghost', patch: { note: 'x' } }]),
    ).toThrow('人物が見つかりません')
  })

  it('一部だけ変更がある場合、無変更の更新は無視されて変更分だけが適用される', () => {
    let doc = createTreeDocument()
    const a = addPerson(doc, { name: { given: '太郎' } })
    doc = a.doc
    const b = addPerson(doc, { name: { given: '花子' } })
    doc = b.doc

    const result = bulkUpsertPersons(doc, [
      { personId: a.personId, patch: { name: { given: '太郎' } } },
      { personId: b.personId, patch: { name: { given: '花子改' } } },
    ])

    expect(result.doc).not.toBe(doc)
    expect(result.doc.persons[a.personId]).toBe(doc.persons[a.personId])
    expect(result.doc.persons[b.personId].name.given).toBe('花子改')
  })
})

import { describe, expect, it } from 'vitest'
import { addChild, addChildLink, addFamilyEvent, addParent, addPerson, addSpouse } from '../domain/commands'
import { createTreeDocument } from '../domain/helpers'
import type { FamilyChartDatum } from './to-family-chart-data'
import {
  compareChildrenByBirthThenName,
  computeHiddenCounts,
  findMaxCoverageRoot,
  findRootAncestor,
  sortSpousesByMarriageDate,
  toFamilyChartData,
} from './to-family-chart-data'

function makeDatum(id: string, overrides: Partial<FamilyChartDatum['data']> = {}): FamilyChartDatum {
  return {
    id,
    data: { personId: id, gender: 'U', displayName: id, ...overrides },
    rels: {},
  }
}

function byId(data: ReturnType<typeof toFamilyChartData>, id: string) {
  const found = data.find((d) => d.id === id)
  if (!found) throw new Error(`not found: ${id}`)
  return found
}

describe('toFamilyChartData: 再婚', () => {
  it('同一人物の複数配偶者がspousesの和集合として射影される', () => {
    let doc = createTreeDocument()
    const a = addPerson(doc, { name: { given: 'A' } })
    doc = a.doc
    const s1 = addSpouse(doc, a.personId, { name: { given: 'B' } })
    doc = s1.doc
    const s2 = addSpouse(doc, a.personId, { name: { given: 'C' } })
    doc = s2.doc

    const data = toFamilyChartData(doc)
    const aDatum = byId(data, a.personId)
    expect(new Set(aDatum.rels.spouses)).toEqual(new Set([s1.spouseId, s2.spouseId]))
  })
})

describe('toFamilyChartData: 養子', () => {
  it('実子はpedigree biological、養子はpedigree adoptedとして射影される', () => {
    let doc = createTreeDocument()
    const parent = addPerson(doc, { name: { given: '親' } })
    doc = parent.doc
    const bioChild = addChild(doc, parent.personId, { name: { given: '実子' } })
    doc = bioChild.doc

    const adoptiveParent = addPerson(doc, { name: { given: '養親' } })
    doc = adoptiveParent.doc
    const adoptiveFamily = addChild(doc, adoptiveParent.personId, { name: { given: 'dummy' } })
    doc = {
      ...adoptiveFamily.doc,
      families: {
        ...adoptiveFamily.doc.families,
        [adoptiveFamily.familyId]: {
          ...adoptiveFamily.doc.families[adoptiveFamily.familyId],
          children: [],
        },
      },
    }
    doc = addChildLink(doc, adoptiveFamily.familyId, bioChild.childId, 'adopted')

    const data = toFamilyChartData(doc)
    // 実親家族が先に登録されていても、養子縁組(非実子)側が優先して採用される(design.md D2)
    expect(byId(data, bioChild.childId).data.pedigree).toBe('adopted')
    expect(byId(data, bioChild.childId).rels.parents).toEqual([adoptiveParent.personId])
  })

  it('実親情報を持たず養親のみに記録された人物は、従来どおり養子として射影される', () => {
    let doc = createTreeDocument()
    const adoptiveParent = addPerson(doc, { name: { given: '養親' } })
    doc = adoptiveParent.doc
    const child = addChild(doc, adoptiveParent.personId, { name: { given: '子' } }, { pedigree: 'adopted' })
    doc = child.doc

    const data = toFamilyChartData(doc)
    expect(byId(data, child.childId).data.pedigree).toBe('adopted')
    expect(byId(data, child.childId).rels.parents).toEqual([adoptiveParent.personId])
  })
})

describe('toFamilyChartData: ひとり親', () => {
  it('配偶者1名の家族の子はparentsが1要素の配列になる', () => {
    let doc = createTreeDocument()
    const parent = addPerson(doc, { name: { given: '親' } })
    doc = parent.doc
    const child = addChild(doc, parent.personId, { name: { given: '子' } })
    doc = child.doc

    const data = toFamilyChartData(doc)
    expect(byId(data, child.childId).rels.parents).toEqual([parent.personId])
  })

  it('親追加コマンド(addParent)で作られたひとり親家族も同様に射影される', () => {
    let doc = createTreeDocument()
    const c = addPerson(doc, { name: { given: '子' } })
    doc = c.doc
    const p = addParent(doc, c.personId, { name: { given: '親' } })
    doc = p.doc

    const data = toFamilyChartData(doc)
    expect(byId(data, c.personId).rels.parents).toEqual([p.parentId])
    expect(byId(data, p.parentId).rels.children).toEqual([c.personId])
  })
})

describe('toFamilyChartData: 復縁', () => {
  it('婚姻→離婚→婚姻のイベントが複数あってもspouses/childrenの射影は重複しない', () => {
    let doc = createTreeDocument()
    const a = addPerson(doc, { name: { given: 'A' } })
    doc = a.doc
    const s = addSpouse(doc, a.personId, { name: { given: 'B' } })
    doc = s.doc
    doc = addFamilyEvent(doc, s.familyId, { type: 'marriage' })
    doc = addFamilyEvent(doc, s.familyId, { type: 'divorce' })
    doc = addFamilyEvent(doc, s.familyId, { type: 'marriage' })
    const child = addChild(doc, a.personId, { name: { given: '子' } }, { otherParentId: s.spouseId })
    doc = child.doc

    const data = toFamilyChartData(doc)
    expect(byId(data, a.personId).rels.spouses).toEqual([s.spouseId])
    expect(new Set(byId(data, a.personId).rels.children)).toEqual(new Set([child.childId]))
  })
})

describe('toFamilyChartData: 基本フィールド', () => {
  it('表示名・性別・生没年がdataへ射影される', () => {
    let doc = createTreeDocument()
    const p = addPerson(doc, {
      name: { surname: '髙橋', given: '廣' },
      gender: 'male',
      birth: { type: 'birth', date: { original: '昭和10年', qualifier: 'exact', date: { year: 1935 } } },
    })
    doc = p.doc

    const datum = byId(toFamilyChartData(doc), p.personId)
    expect(datum.data.displayName).toBe('髙橋 廣')
    expect(datum.data.surname).toBe('髙橋')
    expect(datum.data.given).toBe('廣')
    expect(datum.data.gender).toBe('M')
    expect(datum.data.birthYear).toBe(1935)
    expect(datum.data.deathYear).toBeUndefined()
  })

  it('関係のない人物はrels.spouses/childrenを持たない(parentsのみ、あるいは空)', () => {
    const doc = createTreeDocument()
    const p = addPerson(doc, { name: { given: '独身' } })
    const datum = byId(toFamilyChartData(p.doc), p.personId)
    expect(datum.rels.spouses).toBeUndefined()
    expect(datum.rels.children).toBeUndefined()
    expect(datum.rels.parents).toBeUndefined()
  })
})

describe('findRootAncestor', () => {
  it('親がいない人物は自分自身が最上位祖先になる', () => {
    let doc = createTreeDocument()
    const p = addPerson(doc, { name: { given: '独身' } })
    doc = p.doc
    expect(findRootAncestor(doc, p.personId)).toBe(p.personId)
  })

  it('複数世代の子孫から最上位祖先までたどる', () => {
    let doc = createTreeDocument()
    const gp = addPerson(doc, { name: { given: '祖父' } })
    doc = gp.doc
    const parent = addChild(doc, gp.personId, { name: { given: '親' } })
    doc = parent.doc
    const child = addChild(doc, parent.childId, { name: { given: '子' } })
    doc = child.doc

    expect(findRootAncestor(doc, child.childId)).toBe(gp.personId)
  })

  it('祖先自身を渡した場合はその人物自身を返す(is_ancestryにならない)', () => {
    let doc = createTreeDocument()
    const gp = addPerson(doc, { name: { given: '祖父' } })
    doc = gp.doc
    const parent = addChild(doc, gp.personId, { name: { given: '親' } })
    doc = parent.doc

    expect(findRootAncestor(doc, gp.personId)).toBe(gp.personId)
  })

  it('配偶者(子でない人物)を渡してもその人物自身を返す', () => {
    let doc = createTreeDocument()
    const a = addPerson(doc, { name: { given: 'A' } })
    doc = a.doc
    const s = addSpouse(doc, a.personId, { name: { given: 'B' } })
    doc = s.doc

    expect(findRootAncestor(doc, s.spouseId)).toBe(s.spouseId)
  })
})

describe('compareChildrenByBirthThenName', () => {
  it('生年が判明している子同士は生年昇順になる', () => {
    const older = makeDatum('older', { birthYear: 1985 })
    const younger = makeDatum('younger', { birthYear: 1990 })
    expect(compareChildrenByBirthThenName(older, younger)).toBeLessThan(0)
    expect(compareChildrenByBirthThenName(younger, older)).toBeGreaterThan(0)
  })

  it('生年不明の子同士は名前の辞書順になる', () => {
    const first = makeDatum('first', { displayName: 'あやか' })
    const second = makeDatum('second', { displayName: 'かずき' })
    expect(compareChildrenByBirthThenName(first, second)).toBeLessThan(0)
    expect(compareChildrenByBirthThenName(second, first)).toBeGreaterThan(0)
  })

  it('生年が判明している子は不明な子より前に並ぶ', () => {
    const known = makeDatum('known', { birthYear: 2000 })
    const unknown = makeDatum('unknown', { displayName: 'あ' })
    expect(compareChildrenByBirthThenName(known, unknown)).toBeLessThan(0)
    expect(compareChildrenByBirthThenName(unknown, known)).toBeGreaterThan(0)
  })
})

describe('sortSpousesByMarriageDate', () => {
  it('婚姻イベント日付の昇順に配偶者を並べ替える(渋沢栄一サンプル相当)', () => {
    let doc = createTreeDocument()
    const eiichi = addPerson(doc, { name: { given: '栄一' } })
    doc = eiichi.doc
    const kaneko = addSpouse(doc, eiichi.personId, { name: { given: '兼子' } })
    doc = kaneko.doc
    doc = addFamilyEvent(doc, kaneko.familyId, {
      type: 'marriage',
      date: { original: '明治16年', qualifier: 'about', date: { year: 1883 } },
    })
    const chiyo = addSpouse(doc, eiichi.personId, { name: { given: '千代' } })
    doc = chiyo.doc
    doc = addFamilyEvent(doc, chiyo.familyId, {
      type: 'marriage',
      date: { original: '安政5年', qualifier: 'about', date: { year: 1858 } },
    })

    const datum: FamilyChartDatum = {
      id: eiichi.personId,
      data: { personId: eiichi.personId, gender: 'M', displayName: '栄一' },
      rels: { spouses: [kaneko.spouseId, chiyo.spouseId] },
    }
    sortSpousesByMarriageDate(doc, datum)
    expect(datum.rels.spouses).toEqual([chiyo.spouseId, kaneko.spouseId])
  })

  it('婚姻日付が不明な場合は元の登録順を維持する', () => {
    let doc = createTreeDocument()
    const a = addPerson(doc, { name: { given: 'A' } })
    doc = a.doc
    const s1 = addSpouse(doc, a.personId, { name: { given: 'B' } })
    doc = s1.doc
    const s2 = addSpouse(doc, a.personId, { name: { given: 'C' } })
    doc = s2.doc

    const datum: FamilyChartDatum = {
      id: a.personId,
      data: { personId: a.personId, gender: 'M', displayName: 'A' },
      rels: { spouses: [s1.spouseId, s2.spouseId] },
    }
    sortSpousesByMarriageDate(doc, datum)
    expect(datum.rels.spouses).toEqual([s1.spouseId, s2.spouseId])
  })
})

describe('findMaxCoverageRoot', () => {
  it('人物がいない場合はundefinedを返す', () => {
    const doc = createTreeDocument()
    expect(findMaxCoverageRoot(doc)).toBeUndefined()
  })

  it('単一の連結成分では最上位祖先を返す', () => {
    let doc = createTreeDocument()
    const gp = addPerson(doc, { name: { given: '祖父母' } })
    doc = gp.doc
    const parent = addChild(doc, gp.personId, { name: { given: '親' } })
    doc = parent.doc
    const child = addChild(doc, parent.childId, { name: { given: '子' } })
    doc = child.doc

    expect(findMaxCoverageRoot(doc)).toBe(gp.personId)
  })

  it('複数の非連結クラスタがある場合は人数が多い方のクラスタの根を返す', () => {
    let doc = createTreeDocument()
    // 大きいクラスタ: 祖父母-親-子1-子2 (4人)
    const gp = addPerson(doc, { name: { given: '祖父母' } })
    doc = gp.doc
    const parent = addChild(doc, gp.personId, { name: { given: '親' } })
    doc = parent.doc
    const child1 = addChild(doc, parent.childId, { name: { given: '子1' } })
    doc = child1.doc
    const child2 = addChild(doc, parent.childId, { name: { given: '子2' } })
    doc = child2.doc

    // 小さいクラスタ: 無関係の1人
    const stranger = addPerson(doc, { name: { given: '無関係の人' } })
    doc = stranger.doc

    expect(findMaxCoverageRoot(doc)).toBe(gp.personId)
  })
})

describe('computeHiddenCounts', () => {
  it('全員が可視な場合は非表示人数を返さない', () => {
    let doc = createTreeDocument()
    const a = addPerson(doc, { name: { given: 'A' } })
    doc = a.doc
    const b = addChild(doc, a.personId, { name: { given: 'B' } })
    doc = b.doc

    const visibleIds = new Set(Object.keys(doc.persons))
    expect(computeHiddenCounts(doc, visibleIds).size).toBe(0)
  })

  it('境界となる可視人物に、その先の非表示クラスタの人数がカウントされる', () => {
    let doc = createTreeDocument()
    const a = addPerson(doc, { name: { given: 'A' } })
    doc = a.doc
    const spouse = addSpouse(doc, a.personId, { name: { given: 'B' } })
    doc = spouse.doc
    // Bの別の婚姻家族に子2人(Aからは非表示になりうる傍系)
    const otherSpouse = addSpouse(doc, spouse.spouseId, { name: { given: 'C' } })
    doc = otherSpouse.doc
    const child1 = addChild(doc, spouse.spouseId, { name: { given: 'D' } }, { otherParentId: otherSpouse.spouseId })
    doc = child1.doc
    const child2 = addChild(doc, spouse.spouseId, { name: { given: 'E' } }, { otherParentId: otherSpouse.spouseId })
    doc = child2.doc

    // AとBのみが可視(C・D・Eは非表示)と仮定する
    const visibleIds = new Set([a.personId, spouse.spouseId])
    const hidden = computeHiddenCounts(doc, visibleIds)
    expect(hidden.get(spouse.spouseId)).toBe(3) // C, D, E
    expect(hidden.has(a.personId)).toBe(false)
  })

  it('同じ非表示人物に複数の境界から到達できても二重計上しない', () => {
    let doc = createTreeDocument()
    // 非表示のXは、可視のAの子であり、かつ可視のBの配偶者でもある(2つの境界を持つ)
    const a = addPerson(doc, { name: { given: 'A' } })
    doc = a.doc
    const b = addPerson(doc, { name: { given: 'B' } })
    doc = b.doc
    const x = addChild(doc, a.personId, { name: { given: 'X' } })
    doc = x.doc
    doc = {
      ...doc,
      families: {
        ...doc.families,
        'f-x-b': { id: 'f-x-b', spouseIds: [x.childId, b.personId], kind: 'married', events: [], children: [] },
      },
    }

    const visibleIds = new Set([a.personId, b.personId])
    const hidden = computeHiddenCounts(doc, visibleIds)
    const total = [...hidden.values()].reduce((sum, n) => sum + n, 0)
    // 非表示人物はXの1人のみであり、AかBどちらか一方にのみ計上される(合計1)
    expect(total).toBe(1)
  })
})

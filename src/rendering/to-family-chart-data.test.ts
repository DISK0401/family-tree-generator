import { describe, expect, it } from 'vitest'
import { addChild, addChildLink, addFamilyEvent, addParent, addPerson, addSpouse } from '../domain/commands'
import { createTreeDocument } from '../domain/helpers'
import type { FamilyChartDatum } from './to-family-chart-data'
import {
  buildPedigreeByEdge,
  compareChildrenByBirthThenName,
  computeFullViewRoots,
  computeHiddenCounts,
  findPrimaryParentFamily,
  findRootAncestor,
  FULL_VIEW_ROOT_ID,
  sortSpousesByMarriageDate,
  toFamilyChartData,
  toFullViewFamilyChartData,
} from './to-family-chart-data'

function makeDatum(id: string, overrides: Partial<FamilyChartDatum['data']> = {}): FamilyChartDatum {
  return {
    id,
    data: { personId: id, gender: 'U', displayName: id, deceased: false, ...overrides },
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
    // 生年が年のみ判明の場合は年齢を射影しない(design.md D8)
    expect(datum.data.age).toBeUndefined()
  })

  it('生年月日が年月日まで判明している場合は年齢がdataへ射影される', () => {
    let doc = createTreeDocument()
    const p = addPerson(doc, {
      name: { given: '存命' },
      birth: { type: 'birth', date: { original: '1990-05-01', qualifier: 'exact', date: { year: 1990, month: 5, day: 1 } } },
    })
    doc = p.doc

    const datum = byId(toFamilyChartData(doc), p.personId)
    expect(typeof datum.data.age).toBe('number')
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

  it('実親・養親の両方を持つ人物からは養親側の祖先へたどる(夏目漱石サンプル相当)', () => {
    let doc = createTreeDocument()
    const naokatsu = addPerson(doc, { name: { given: '直克' } })
    doc = naokatsu.doc
    const soseki = addChild(doc, naokatsu.personId, { name: { given: '金之助' } })
    doc = soseki.doc
    const shiobara = addPerson(doc, { name: { given: '昌之助' } })
    doc = shiobara.doc
    doc = {
      ...doc,
      families: {
        ...doc.families,
        'f-shiobara': {
          id: 'f-shiobara',
          spouseIds: [shiobara.personId],
          kind: 'married',
          events: [],
          children: [{ childId: soseki.childId, pedigree: 'adopted' }],
        },
      },
    }

    expect(findRootAncestor(doc, soseki.childId)).toBe(shiobara.personId)
  })
})

describe('findPrimaryParentFamily', () => {
  it('実子のみの場合はその家族を返す', () => {
    let doc = createTreeDocument()
    const parent = addPerson(doc, { name: { given: '親' } })
    doc = parent.doc
    const child = addChild(doc, parent.personId, { name: { given: '子' } })
    doc = child.doc

    expect(findPrimaryParentFamily(doc, child.childId)?.spouseIds).toEqual([parent.personId])
  })

  it('実親・養親の両方がある場合は養親側の家族を優先して返す', () => {
    let doc = createTreeDocument()
    const bioParent = addPerson(doc, { name: { given: '実親' } })
    doc = bioParent.doc
    const child = addChild(doc, bioParent.personId, { name: { given: '子' } })
    doc = child.doc
    const adoptiveParent = addPerson(doc, { name: { given: '養親' } })
    doc = adoptiveParent.doc
    doc = {
      ...doc,
      families: {
        ...doc.families,
        'f-adoptive': {
          id: 'f-adoptive',
          spouseIds: [adoptiveParent.personId],
          kind: 'married',
          events: [],
          children: [{ childId: child.childId, pedigree: 'adopted' }],
        },
      },
    }

    expect(findPrimaryParentFamily(doc, child.childId)?.spouseIds).toEqual([adoptiveParent.personId])
  })

  it('親を持たない人物にはundefinedを返す', () => {
    let doc = createTreeDocument()
    const p = addPerson(doc, { name: { given: '独身' } })
    doc = p.doc
    expect(findPrimaryParentFamily(doc, p.personId)).toBeUndefined()
  })
})

describe('buildPedigreeByEdge', () => {
  it('実親・養親それぞれの辺に、その家族固有の続柄が記録される(主たる家族に限らない)', () => {
    let doc = createTreeDocument()
    const bioParent = addPerson(doc, { name: { given: '実親' } })
    doc = bioParent.doc
    const child = addChild(doc, bioParent.personId, { name: { given: '子' } })
    doc = child.doc
    const adoptiveParent = addPerson(doc, { name: { given: '養親' } })
    doc = adoptiveParent.doc
    doc = {
      ...doc,
      families: {
        ...doc.families,
        'f-adoptive': {
          id: 'f-adoptive',
          spouseIds: [adoptiveParent.personId],
          kind: 'married',
          events: [],
          children: [{ childId: child.childId, pedigree: 'adopted' }],
        },
      },
    }

    const edges = buildPedigreeByEdge(doc)
    // 主たる親子線はadoptedを優先するが、実親側の辺そのものはbiologicalのまま保持される
    expect(edges.get(`${bioParent.personId}|${child.childId}`)).toBe('biological')
    expect(edges.get(`${adoptiveParent.personId}|${child.childId}`)).toBe('adopted')
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
      data: { personId: eiichi.personId, gender: 'M', displayName: '栄一', deceased: false },
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
      data: { personId: a.personId, gender: 'M', displayName: 'A', deceased: false },
      rels: { spouses: [s1.spouseId, s2.spouseId] },
    }
    sortSpousesByMarriageDate(doc, datum)
    expect(datum.rels.spouses).toEqual([s1.spouseId, s2.spouseId])
  })
})

describe('computeFullViewRoots', () => {
  it('人物がいない場合は空配列を返す', () => {
    const doc = createTreeDocument()
    expect(computeFullViewRoots(doc)).toEqual([])
  })

  it('単一の連結成分では根を1つだけ返す', () => {
    let doc = createTreeDocument()
    const gp = addPerson(doc, { name: { given: '祖父母' } })
    doc = gp.doc
    const parent = addChild(doc, gp.personId, { name: { given: '親' } })
    doc = parent.doc
    const child = addChild(doc, parent.childId, { name: { given: '子' } })
    doc = child.doc

    expect(computeFullViewRoots(doc)).toEqual([gp.personId])
  })

  it('非連結な複数クラスタがある場合はクラスタごとに根を返す', () => {
    let doc = createTreeDocument()
    const gp = addPerson(doc, { name: { given: '祖父母' } })
    doc = gp.doc
    const parent = addChild(doc, gp.personId, { name: { given: '親' } })
    doc = parent.doc
    const stranger = addPerson(doc, { name: { given: '無関係の人' } })
    doc = stranger.doc

    expect(computeFullViewRoots(doc).sort()).toEqual([gp.personId, stranger.personId].sort())
  })

  it('実親・養親の両方を持つ人物がいる場合、両方の家系の根を返す(夏目漱石サンプル相当)', () => {
    let doc = createTreeDocument()
    const naokatsu = addPerson(doc, { name: { given: '直克' } })
    doc = naokatsu.doc
    const soseki = addChild(doc, naokatsu.personId, { name: { given: '金之助' } })
    doc = soseki.doc
    const shiobara = addPerson(doc, { name: { given: '昌之助' } })
    doc = shiobara.doc
    doc = {
      ...doc,
      families: {
        ...doc.families,
        'f-shiobara': {
          id: 'f-shiobara',
          spouseIds: [shiobara.personId],
          kind: 'married',
          events: [],
          children: [{ childId: soseki.childId, pedigree: 'adopted' }],
        },
      },
    }

    expect(computeFullViewRoots(doc).sort()).toEqual([naokatsu.personId, shiobara.personId].sort())
  })

  it('子のいない配偶者だけの家族も、配偶者どちらか一方のみを根として扱う(重複を避ける)', () => {
    let doc = createTreeDocument()
    const a = addPerson(doc, { name: { given: 'A' } })
    doc = a.doc
    const s = addSpouse(doc, a.personId, { name: { given: 'B' } })
    doc = s.doc

    expect(computeFullViewRoots(doc)).toEqual([a.personId])
  })

  it('婚姻のみでつながる2つの血族は、それぞれの始祖が別々の根として返される(係累不明の配偶者が誤って唯一の根になるバグの回帰)', () => {
    // 紀行・和枝の子である佳彦が、イツ子・定夫の子である美和と結婚し、2つの血族が
    // 婚姻でのみつながる。愛梨奈(佳彦・美和の子)は係累の記録が無い奥西亮太と結婚する。
    // 奥西亮太は主たる親を持たず(=根の候補)、子も無いため、素朴な「連結成分ごとに1根」の
    // アルゴリズムだと彼だけが唯一の根に選ばれ、彼自身の視点からは配偶者以外誰も辿れず、
    // 家系全体がほぼ表示されなくなってしまう(実際に報告されたバグ)
    let doc = createTreeDocument()
    const noriyuki = addPerson(doc, { name: { given: '紀行' } })
    doc = noriyuki.doc
    const kazue = addSpouse(doc, noriyuki.personId, { name: { given: '和枝' } })
    doc = kazue.doc
    const yoshihiko = addChild(doc, noriyuki.personId, { name: { given: '佳彦' } }, { otherParentId: kazue.spouseId })
    doc = yoshihiko.doc

    const itsuko = addPerson(doc, { name: { given: 'イツ子' } })
    doc = itsuko.doc
    const sadao = addSpouse(doc, itsuko.personId, { name: { given: '定夫' } })
    doc = sadao.doc
    const miwa = addChild(doc, itsuko.personId, { name: { given: '美和' } }, { otherParentId: sadao.spouseId })
    doc = miwa.doc

    // 既存の佳彦・美和を婚姻でつなぐ(addSpouseは新規人物しか作れないため、直接familyを追加する)
    doc = {
      ...doc,
      families: {
        ...doc.families,
        'f-yoshihiko-miwa': {
          id: 'f-yoshihiko-miwa',
          spouseIds: [yoshihiko.childId, miwa.childId],
          kind: 'married',
          events: [],
          children: [],
        },
      },
    }
    const airina = addChild(doc, yoshihiko.childId, { name: { given: '愛梨奈' } }, { otherParentId: miwa.childId })
    doc = airina.doc
    const okunishi = addSpouse(doc, airina.childId, { name: { given: '奥西亮太' } })
    doc = okunishi.doc

    const roots = computeFullViewRoots(doc)
    const data = toFullViewFamilyChartData(doc)
    const allPersonIds = Object.keys(doc.persons)
    // 血族の始祖である紀行・イツ子側の系統がどちらも根として選ばれ、
    // 全人物がtoFullViewFamilyChartDataの出力に含まれる(=描画データとして漏れが無い)
    expect(roots).toContain(noriyuki.personId)
    expect(roots).toContain(itsuko.personId)
    for (const id of allPersonIds) {
      expect(data.some((d) => d.data.personId === id)).toBe(true)
    }
    // 奥西亮太(子も主たる親も持たない他家から嫁いだ配偶者)は、愛梨奈の配偶者として既に辿れるため
    // 冗長な根にはならない
    expect(roots).not.toContain(okunishi.spouseId)
  })
})

describe('toFullViewFamilyChartData', () => {
  it('実親・養親の両方を持つ人物が2枚のカードとして射影される(夏目漱石サンプル相当)', () => {
    let doc = createTreeDocument()
    const naokatsu = addPerson(doc, { name: { given: '直克' } })
    doc = naokatsu.doc
    const soseki = addChild(doc, naokatsu.personId, { name: { given: '金之助' } })
    doc = soseki.doc
    const shiobara = addPerson(doc, { name: { given: '昌之助' } })
    doc = shiobara.doc
    doc = {
      ...doc,
      families: {
        ...doc.families,
        'f-shiobara': {
          id: 'f-shiobara',
          spouseIds: [shiobara.personId],
          kind: 'married',
          events: [],
          children: [{ childId: soseki.childId, pedigree: 'adopted' }],
        },
      },
    }

    const data = toFullViewFamilyChartData(doc)
    // 主たる家族(養親側)の実カード1件+非主たる家族(実親側)向けのスタブカード1件で、
    // 合計2枚のカードとして射影される
    const sosekiCards = data.filter((d) => d.data.personId === soseki.childId)
    expect(sosekiCards).toHaveLength(2)

    const realCard = sosekiCards.find((d) => d.id === soseki.childId)
    expect(realCard?.rels.parents).toEqual([shiobara.personId])

    // スタブカードはrelsが空(子孫方向へ連鎖しない)。実子(kyoko/fudeko相当)がいてもスタブ配下には現れない
    const stubCard = sosekiCards.find((d) => d.id !== soseki.childId)
    expect(stubCard?.rels).toEqual({})

    // 実親(直克)側の子リストには、実カードではなくスタブカードのIDが入る
    const naokatsuDatum = data.find((d) => d.id === naokatsu.personId)
    expect(naokatsuDatum?.rels.children).toEqual([stubCard?.id])

    const virtual = data.find((d) => d.id === FULL_VIEW_ROOT_ID)
    expect(virtual?.rels.children?.sort()).toEqual([naokatsu.personId, shiobara.personId].sort())
  })

  it('非主たる家族の子(スタブ)の、さらにその子孫は連鎖的に重複しない', () => {
    let doc = createTreeDocument()
    const naokatsu = addPerson(doc, { name: { given: '直克' } })
    doc = naokatsu.doc
    const soseki = addChild(doc, naokatsu.personId, { name: { given: '金之助' } })
    doc = soseki.doc
    const shiobara = addPerson(doc, { name: { given: '昌之助' } })
    doc = shiobara.doc
    doc = {
      ...doc,
      families: {
        ...doc.families,
        'f-shiobara': {
          id: 'f-shiobara',
          spouseIds: [shiobara.personId],
          kind: 'married',
          events: [],
          children: [{ childId: soseki.childId, pedigree: 'adopted' }],
        },
      },
    }
    const kyoko = addChild(doc, soseki.childId, { name: { given: '筆子' } })
    doc = kyoko.doc

    const data = toFullViewFamilyChartData(doc)
    // 漱石の実子(筆子相当)は、漱石自身は2枚(実カード+スタブ)になっても、
    // 連鎖的に重複はせず1枚のみ描画される
    const kyokoCards = data.filter((d) => d.data.personId === kyoko.childId)
    expect(kyokoCards).toHaveLength(1)
  })

  it('根が1つも無い(人物ゼロ)場合は仮想ルートを追加しない', () => {
    const doc = createTreeDocument()
    const data = toFullViewFamilyChartData(doc)
    expect(data.find((d) => d.id === FULL_VIEW_ROOT_ID)).toBeUndefined()
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
    expect(hidden.get(spouse.spouseId)?.count).toBe(3) // C, D, E
    expect(hidden.get(spouse.spouseId)?.revealId).toBe(otherSpouse.spouseId)
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
    const total = [...hidden.values()].reduce((sum, info) => sum + info.count, 0)
    // 非表示人物はXの1人のみであり、AかBどちらか一方にのみ計上される(合計1)
    expect(total).toBe(1)
  })

  it('revealIdはクリックした際に視点を追従させる先の直接の非表示隣接人物になる(夏目漱石サンプル相当)', () => {
    let doc = createTreeDocument()
    const naokatsu = addPerson(doc, { name: { given: '直克' } })
    doc = naokatsu.doc
    const soseki = addChild(doc, naokatsu.personId, { name: { given: '金之助' } })
    doc = soseki.doc
    const shiobara = addPerson(doc, { name: { given: '昌之助' } })
    doc = shiobara.doc
    doc = {
      ...doc,
      families: {
        ...doc.families,
        'f-shiobara': {
          id: 'f-shiobara',
          spouseIds: [shiobara.personId],
          kind: 'married',
          events: [],
          children: [{ childId: soseki.childId, pedigree: 'adopted' }],
        },
      },
    }

    // 実親側(直克)が可視、養親側(昌之助)が非表示の状態を想定する
    const visibleIds = new Set([naokatsu.personId, soseki.childId])
    const hidden = computeHiddenCounts(doc, visibleIds)
    expect(hidden.get(soseki.childId)).toEqual({ count: 1, revealId: shiobara.personId })
  })
})

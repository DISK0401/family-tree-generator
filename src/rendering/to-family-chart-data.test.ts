import { describe, expect, it } from 'vitest'
import { addChild, addChildLink, addFamilyEvent, addParent, addPerson, addSpouse } from '../domain/commands'
import { createTreeDocument } from '../domain/helpers'
import { toFamilyChartData } from './to-family-chart-data'

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
    // 実親家族が先に登録されているため、主たる親子線は実親側(biological)が採用される
    expect(byId(data, bioChild.childId).data.pedigree).toBe('biological')
    expect(byId(data, bioChild.childId).rels.parents).toEqual([parent.personId])
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

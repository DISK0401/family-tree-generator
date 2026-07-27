import { describe, expect, it } from 'vitest'
import { CARD_SIZE } from './coordinates'
import { buildGraph, splitIntoComponents } from './graph'
import { layoutPedigree } from './index'
import { family, person, testDoc } from './test-fixtures'
import type { Family, Person, TreeDocument } from '../domain/types'

describe('layoutPedigree', () => {
  it('婚姻でのみつながる2つの血族が1つの連結した配置になる(5.1)', () => {
    const doc = testDoc(
      [
        person('hFather', '夫の父'),
        person('hMother', '夫の母'),
        person('husband', '夫'),
        person('wFather', '妻の父'),
        person('wMother', '妻の母'),
        person('wife', '妻'),
      ],
      [
        family('fHusbandParents', ['hFather', 'hMother'], [{ childId: 'husband', pedigree: 'biological' }]),
        family('fWifeParents', ['wFather', 'wMother'], [{ childId: 'wife', pedigree: 'biological' }]),
        family('fMarriage', ['husband', 'wife'], []),
      ],
    )
    const layout = layoutPedigree(doc)

    expect(layout.persons).toHaveLength(6)
    // 夫婦の婚姻線
    const marriageLinks = layout.links.filter((l) => l.kind === 'marriage')
    expect(marriageLinks.some((l) => l.kind === 'marriage' && new Set(l.spouseIds).size === 2 && l.spouseIds.includes('husband') && l.spouseIds.includes('wife'))).toBe(true)
    // 妻の親どうしの婚姻線
    expect(marriageLinks.some((l) => l.kind === 'marriage' && l.spouseIds.includes('wFather') && l.spouseIds.includes('wMother'))).toBe(true)
    // 妻とその親を結ぶ系線
    const wifeParentLink = layout.links.find((l) => l.kind === 'parent-child' && l.childId === 'wife' && l.familyId === 'fWifeParents')
    expect(wifeParentLink).toBeDefined()

    // 夫の実家と妻の実家が、婚姻を介して1つの連結成分として扱われたことの確認。
    // 2つの独立した成分に分かれていれば、層内の順序決定・座標割り当てが別々に行われ、
    // 成分間ギャップを挟んで横に並ぶだけになる(spec「婚姻でつながる2つの血族が1枚に収まる」)
    expect(splitIntoComponents(buildGraph(doc))).toHaveLength(1)
  })

  it('婿養子(同じ家族の子どうしが夫婦)の構成を検証する(5.2)', () => {
    const doc = testDoc(
      [person('p', 'P'), person('q', 'Q'), person('d', 'D(実子)'), person('x', 'X(婿養子)')],
      [
        family('fPQ', ['p', 'q'], [
          { childId: 'd', pedigree: 'biological' },
          { childId: 'x', pedigree: 'adopted' },
        ]),
        family('fDX', ['d', 'x'], []),
      ],
    )
    const layout = layoutPedigree(doc)

    expect(layout.persons.filter((person) => person.personId === 'd')).toHaveLength(1)
    expect(layout.persons.filter((person) => person.personId === 'x')).toHaveLength(1)

    const marriageLink = layout.links.find((l) => l.kind === 'marriage' && l.familyId === 'fDX')
    expect(marriageLink?.kind === 'marriage' && new Set(marriageLink.spouseIds)).toEqual(new Set(['d', 'x']))

    const parentLinks = layout.links.filter((l) => l.kind === 'parent-child' && l.familyId === 'fPQ')
    expect(parentLinks).toHaveLength(2)
    const pedigreeByChild = new Map(parentLinks.map((l) => [l.kind === 'parent-child' && l.childId, l.kind === 'parent-child' && l.pedigree]))
    expect(pedigreeByChild.get('d')).toBe('biological')
    expect(pedigreeByChild.get('x')).toBe('adopted')
  })

  it('ひとり親の家族を検証する: 配偶者不在を理由に失敗しない(5.3)', () => {
    const doc = testDoc(
      [person('soleParent', 'ひとり親'), person('child', '子')],
      [family('f1', ['soleParent'], [{ childId: 'child', pedigree: 'biological' }])],
    )

    expect(() => layoutPedigree(doc)).not.toThrow()
    const layout = layoutPedigree(doc)
    const link = layout.links.find((l) => l.kind === 'parent-child' && l.childId === 'child')
    expect(link).toBeDefined()
  })

  it('連結していない集団はすべて配置に含まれ、重ならない(4.5)', () => {
    const doc = testDoc(
      [
        person('main1', '本体1'),
        person('main2', '本体2'),
        person('mainChild', '本体の子'),
        person('lonely', '孤立した人物'),
        person('cluster1', '独立した夫婦1'),
        person('cluster2', '独立した夫婦2'),
      ],
      [
        family('fMain', ['main1', 'main2'], [{ childId: 'mainChild', pedigree: 'biological' }]),
        family('fCluster', ['cluster1', 'cluster2'], []),
      ],
    )
    const layout = layoutPedigree(doc)

    expect(layout.persons).toHaveLength(6)
    const ids = layout.persons.map((p) => p.personId).sort()
    expect(ids).toEqual(['cluster1', 'cluster2', 'lonely', 'main1', 'main2', 'mainChild'].sort())

    for (let i = 0; i < layout.persons.length; i++) {
      for (let j = i + 1; j < layout.persons.length; j++) {
        const a = layout.persons[i]
        const b = layout.persons[j]
        const overlapX = a.x < b.x + CARD_SIZE.width && b.x < a.x + CARD_SIZE.width
        const overlapY = a.y < b.y + CARD_SIZE.height && b.y < a.y + CARD_SIZE.height
        expect(overlapX && overlapY).toBe(false)
      }
    }
  })

  it('persons / families の列挙順が変わっても同じ座標になる(D5)', () => {
    // spec「レイアウトの決定性」の「オブジェクトの列挙順に依存してはならない」を機械的に確かめる。
    // 同じレイアウトを2回呼ぶだけでは、`Object.values()`の順に依存していても両方が同じ順で
    // 列挙されるため検出できない。登録順を逆にした同内容のドキュメントと突き合わせる
    const ps = [
      person('gf', '祖父'),
      person('gm', '祖母'),
      person('c1', '子1'),
      person('c2', '子2'),
      person('c3', '子3'),
      person('s1', '配偶者'),
      person('g1', '孫'),
    ]
    const fs = [
      family('fParents', ['gf', 'gm'], [
        { childId: 'c1', pedigree: 'biological' },
        { childId: 'c2', pedigree: 'biological' },
        { childId: 'c3', pedigree: 'biological' },
      ]),
      family('fMarriage', ['c2', 's1'], [{ childId: 'g1', pedigree: 'biological' }]),
    ]

    const inOrder = layoutPedigree(testDoc(ps, fs))
    const reversed = layoutPedigree(testDoc([...ps].reverse(), [...fs].reverse()))

    expect(reversed.persons).toEqual(inOrder.persons)
    expect(reversed.families).toEqual(inOrder.families)
    expect(reversed.links).toEqual(inOrder.links)
  })

  it('存在しない人物への参照を含んでいても例外を出さずに配置を返す', () => {
    const doc = testDoc(
      [person('parent', '親')],
      [family('f1', ['parent', 'ghost'], [{ childId: 'ghost-child', pedigree: 'biological' }])],
    )
    expect(() => layoutPedigree(doc)).not.toThrow()
    const layout = layoutPedigree(doc)
    expect(layout.persons.map((p) => p.personId)).toEqual(['parent'])
  })
})

/** 30名規模の合成データを生成する(5.4の計測用)。数世代にわたる婚姻・出生の連鎖を模す */
function buildSyntheticDoc(targetCount: number): TreeDocument {
  const persons: Person[] = []
  const families: Family[] = []
  let personSeq = 0
  let familySeq = 0

  function addPerson(): string {
    const id = `p${personSeq++}`
    persons.push(person(id, id))
    return id
  }

  const root: [string, string] = [addPerson(), addPerson()]
  families.push(family(`f${familySeq++}`, root, []))
  let currentCouples: Array<[string, string]> = [root]

  while (persons.length < targetCount && currentCouples.length > 0) {
    const nextCouples: Array<[string, string]> = []
    for (const [a, b] of currentCouples) {
      const children: Family['children'] = []
      for (let i = 0; i < 2 && persons.length < targetCount; i++) {
        const child = addPerson()
        children.push({ childId: child, pedigree: 'biological' })
        if (persons.length < targetCount) {
          const spouseIn = addPerson()
          families.push(family(`f${familySeq++}`, [child, spouseIn], []))
          nextCouples.push([child, spouseIn])
        }
      }
      const parentFamilyId = families.find((f) => f.spouseIds.includes(a) && f.spouseIds.includes(b))?.id
      if (parentFamilyId) {
        const target = families.find((f) => f.id === parentFamilyId)
        if (target) target.children = children
      }
    }
    currentCouples = nextCouples
  }

  // 端数調整: 目標人数に満たない場合は、係累の記録がない人物を追加する(孤立した人物)
  while (persons.length < targetCount) addPerson()

  return testDoc(persons, families)
}

describe('layoutPedigree の計算時間(5.4)', () => {
  it('30名規模のデータを現実的な時間で計算できる', () => {
    const doc = buildSyntheticDoc(30)
    expect(Object.keys(doc.persons)).toHaveLength(30)

    const start = performance.now()
    const layout = layoutPedigree(doc)
    const elapsedMs = performance.now() - start

    console.log(`[layoutPedigree] 30名規模の計算時間: ${elapsedMs.toFixed(2)}ms`)

    expect(layout.persons).toHaveLength(30)
    expect(elapsedMs).toBeLessThan(1000) // 回帰検知用の緩い上限。実測値はdesign.mdのRisksへ記録する
  })
})

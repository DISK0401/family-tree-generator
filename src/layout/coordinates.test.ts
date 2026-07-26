import { describe, expect, it } from 'vitest'
import { assignCoordinates, CARD_SIZE, HORIZONTAL_GAP, VERTICAL_GAP } from './coordinates'
import { assignGenerations } from './generations'
import { buildGraph } from './graph'
import { orderWithinLayers } from './ordering'
import { family, person, testDoc } from './test-fixtures'

function layoutOf(doc: ReturnType<typeof testDoc>) {
  const graph = buildGraph(doc)
  const { generationOf } = assignGenerations(graph)
  const layerOrder = orderWithinLayers(graph, generationOf)
  return { graph, generationOf, layerOrder, result: assignCoordinates(graph, generationOf, layerOrder) }
}

describe('assignCoordinates', () => {
  it('カードが重ならず、層ごとに一定の間隔で並ぶ(4.1)', () => {
    const doc = testDoc(
      [person('gf', '祖父'), person('gm', '祖母'), person('father', '父'), person('mother', '母')],
      [family('f1', ['gf', 'gm'], [{ childId: 'father', pedigree: 'biological' }]), family('f2', ['father', 'mother'], [])],
    )
    const { result } = layoutOf(doc)

    const byId = new Map(result.persons.map((p) => [p.personId, p]))
    // 層0(祖父母)は一定間隔で並ぶ
    const gf = byId.get('gf')!
    const gm = byId.get('gm')!
    expect(Math.abs(gm.x - gf.x)).toBe(CARD_SIZE.width + HORIZONTAL_GAP)
    expect(gf.y).toBe(gm.y)
    // 層1(父母)は層0とは異なる行に、層の高さ+間隔ぶん下にある
    const father = byId.get('father')!
    expect(father.y).toBe(gf.y + CARD_SIZE.height + VERTICAL_GAP)

    // どの2枚のカードも矩形として重ならない
    for (let i = 0; i < result.persons.length; i++) {
      for (let j = i + 1; j < result.persons.length; j++) {
        const a = result.persons[i]
        const b = result.persons[j]
        const overlapX = a.x < b.x + CARD_SIZE.width && b.x < a.x + CARD_SIZE.width
        const overlapY = a.y < b.y + CARD_SIZE.height && b.y < a.y + CARD_SIZE.height
        expect(overlapX && overlapY).toBe(false)
      }
    }
  })

  it('子3人を持つ夫婦で、結合点のx座標が子の中央になる(4.2)', () => {
    const doc = testDoc(
      [
        person('father', '父'),
        person('mother', '母'),
        person('c1', '子1'),
        person('c2', '子2'),
        person('c3', '子3'),
      ],
      [
        family('f1', ['father', 'mother'], [
          { childId: 'c1', pedigree: 'biological' },
          { childId: 'c2', pedigree: 'biological' },
          { childId: 'c3', pedigree: 'biological' },
        ]),
      ],
    )
    const { result } = layoutOf(doc)
    const familyPos = result.families.find((f) => f.familyId === 'f1')!
    const childXs = result.persons.filter((p) => ['c1', 'c2', 'c3'].includes(p.personId)).map((p) => p.x + CARD_SIZE.width / 2)
    const expectedCenter = childXs.reduce((sum, x) => sum + x, 0) / childXs.length
    expect(familyPos.x).toBeCloseTo(expectedCenter)
  })

  it('子のいない夫婦は、結合点のx座標が配偶者の中央になる', () => {
    const doc = testDoc(
      [person('husband', '夫'), person('wife', '妻')],
      [family('f1', ['husband', 'wife'], [])],
    )
    const { result } = layoutOf(doc)
    const familyPos = result.families.find((f) => f.familyId === 'f1')!
    const husband = result.persons.find((p) => p.personId === 'husband')!
    const wife = result.persons.find((p) => p.personId === 'wife')!
    const expectedCenter = (husband.x + wife.x + CARD_SIZE.width) / 2
    expect(familyPos.x).toBeCloseTo(expectedCenter)
  })

  it('実子と養子が混在する家族で、それぞれの系線に正しい続柄が付く(4.3)', () => {
    const doc = testDoc(
      [person('father', '父'), person('mother', '母'), person('bio', '実子'), person('adopted', '養子')],
      [
        family('f1', ['father', 'mother'], [
          { childId: 'bio', pedigree: 'biological' },
          { childId: 'adopted', pedigree: 'adopted' },
        ]),
      ],
    )
    const { result } = layoutOf(doc)
    const links = result.links.filter((l) => l.kind === 'parent-child')
    const bioLink = links.find((l) => l.kind === 'parent-child' && l.childId === 'bio')
    const adoptedLink = links.find((l) => l.kind === 'parent-child' && l.childId === 'adopted')
    expect(bioLink?.kind === 'parent-child' && bioLink.pedigree).toBe('biological')
    expect(adoptedLink?.kind === 'parent-child' && adoptedLink.pedigree).toBe('adopted')
  })

  it('結合点は必ず婚姻線の上に乗る(親子線が宙に浮かない)', () => {
    // 夫の実家と妻の実家が婚姻でのみつながる構成。層ごとに左から詰めるだけだと、
    // 妻の結合点(子=妻の中央)が妻の親たちから遠く離れた位置に置かれ、
    // 妻への親子線が婚姻線から切り離されて宙に浮く
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
    const { graph, result } = layoutOf(doc)
    const centerXOf = new Map(result.persons.map((p) => [p.personId, p.x + CARD_SIZE.width / 2]))

    for (const familyPos of result.families) {
      const spouseCenters = (graph.families.get(familyPos.familyId)?.spouseIds ?? [])
        .map((id) => centerXOf.get(id))
        .filter((x): x is number => x !== undefined)
      if (spouseCenters.length < 2) continue
      expect(familyPos.x).toBeGreaterThanOrEqual(Math.min(...spouseCenters))
      expect(familyPos.x).toBeLessThanOrEqual(Math.max(...spouseCenters))
    }

    // 親子線の始点(結合点)が婚姻線の経路上にあることを、経路そのもので確かめる
    for (const link of result.links) {
      if (link.kind !== 'parent-child') continue
      const marriage = result.links.find((l) => l.kind === 'marriage' && l.familyId === link.familyId)
      if (!marriage) continue
      const xs = marriage.points.map((p) => p.x)
      expect(link.points[0].y).toBe(marriage.points[0].y)
      expect(link.points[0].x).toBeGreaterThanOrEqual(Math.min(...xs))
      expect(link.points[0].x).toBeLessThanOrEqual(Math.max(...xs))
    }
  })

  it('子は親の位置へ寄せられる(層ごとに左から詰めるだけにしない)', () => {
    // 妻の実家は層0の右側にある。緩和が効いていれば、妻も層1の右側へ寄る
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
    const { result } = layoutOf(doc)
    const centerXOf = new Map(result.persons.map((p) => [p.personId, p.x + CARD_SIZE.width / 2]))

    const wifeCenter = centerXOf.get('wife')!
    const husbandCenter = centerXOf.get('husband')!
    // 妻は自分の親たちの範囲に収まり、夫は夫の親たちの範囲に収まる
    expect(wifeCenter).toBeGreaterThanOrEqual(centerXOf.get('wFather')!)
    expect(wifeCenter).toBeLessThanOrEqual(centerXOf.get('wMother')!)
    expect(husbandCenter).toBeGreaterThanOrEqual(centerXOf.get('hFather')!)
    expect(husbandCenter).toBeLessThanOrEqual(centerXOf.get('hMother')!)
  })

  it('実親・養親の双方を持つ人物は位置が1つだけで、2本の親子線がそれぞれの続柄を持つ(4.4)', () => {
    const doc = testDoc(
      [person('bioParent', '実親'), person('adoptiveParent', '養親'), person('d', 'D')],
      [
        family('fBio', ['bioParent'], [{ childId: 'd', pedigree: 'biological' }]),
        family('fAdoptive', ['adoptiveParent'], [{ childId: 'd', pedigree: 'adopted' }]),
      ],
    )
    const { result } = layoutOf(doc)

    const dPositions = result.persons.filter((p) => p.personId === 'd')
    expect(dPositions).toHaveLength(1)

    const linksToD = result.links.filter((l) => l.kind === 'parent-child' && l.childId === 'd')
    expect(linksToD).toHaveLength(2)
    const pedigrees = linksToD.map((l) => l.kind === 'parent-child' && l.pedigree).sort()
    expect(pedigrees).toEqual(['adopted', 'biological'])
  })
})

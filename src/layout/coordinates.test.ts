import { describe, expect, it } from 'vitest'
import {
  assignCoordinates,
  assignLinkLanes,
  CARD_SIZE,
  HORIZONTAL_GAP,
  VERTICAL_GAP,
} from './coordinates'
import { assignGenerations } from './generations'
import { buildGraph } from './graph'
import { orderWithinLayers } from './ordering'
import { family, person, testDoc } from './test-fixtures'
import {
  expectLayoutInvariants,
  expectLinksAvoidForeignCards,
  expectPointsWithinBounds,
} from './test-invariants'

function layoutOf(doc: ReturnType<typeof testDoc>) {
  const graph = buildGraph(doc)
  const { generationOf } = assignGenerations(graph)
  const layerOrder = orderWithinLayers(graph, generationOf)
  return {
    graph,
    generationOf,
    layerOrder,
    result: assignCoordinates(graph, generationOf, layerOrder),
  }
}

describe('assignCoordinates', () => {
  it('カードが重ならず、層ごとに一定の間隔で並ぶ(4.1)', () => {
    const doc = testDoc(
      [
        person('gf', '祖父'),
        person('gm', '祖母'),
        person('father', '父'),
        person('mother', '母'),
      ],
      [
        family(
          'f1',
          ['gf', 'gm'],
          [{ childId: 'father', pedigree: 'biological' }],
        ),
        family('f2', ['father', 'mother'], []),
      ],
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
        const overlapX =
          a.x < b.x + CARD_SIZE.width && b.x < a.x + CARD_SIZE.width
        const overlapY =
          a.y < b.y + CARD_SIZE.height && b.y < a.y + CARD_SIZE.height
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
        family(
          'f1',
          ['father', 'mother'],
          [
            { childId: 'c1', pedigree: 'biological' },
            { childId: 'c2', pedigree: 'biological' },
            { childId: 'c3', pedigree: 'biological' },
          ],
        ),
      ],
    )
    const { result } = layoutOf(doc)
    const familyPos = result.families.find((f) => f.familyId === 'f1')!
    const childXs = result.persons
      .filter((p) => ['c1', 'c2', 'c3'].includes(p.personId))
      .map((p) => p.x + CARD_SIZE.width / 2)
    const expectedCenter =
      childXs.reduce((sum, x) => sum + x, 0) / childXs.length
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
      [
        person('father', '父'),
        person('mother', '母'),
        person('bio', '実子'),
        person('adopted', '養子'),
      ],
      [
        family(
          'f1',
          ['father', 'mother'],
          [
            { childId: 'bio', pedigree: 'biological' },
            { childId: 'adopted', pedigree: 'adopted' },
          ],
        ),
      ],
    )
    const { result } = layoutOf(doc)
    const links = result.links.filter((l) => l.kind === 'parent-child')
    const bioLink = links.find(
      (l) => l.kind === 'parent-child' && l.childId === 'bio',
    )
    const adoptedLink = links.find(
      (l) => l.kind === 'parent-child' && l.childId === 'adopted',
    )
    expect(bioLink?.kind === 'parent-child' && bioLink.pedigree).toBe(
      'biological',
    )
    expect(adoptedLink?.kind === 'parent-child' && adoptedLink.pedigree).toBe(
      'adopted',
    )
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
        family(
          'fHusbandParents',
          ['hFather', 'hMother'],
          [{ childId: 'husband', pedigree: 'biological' }],
        ),
        family(
          'fWifeParents',
          ['wFather', 'wMother'],
          [{ childId: 'wife', pedigree: 'biological' }],
        ),
        family('fMarriage', ['husband', 'wife'], []),
      ],
    )
    const { graph, result } = layoutOf(doc)
    const centerXOf = new Map(
      result.persons.map((p) => [p.personId, p.x + CARD_SIZE.width / 2]),
    )

    for (const familyPos of result.families) {
      const spouseCenters = (
        graph.families.get(familyPos.familyId)?.spouseIds ?? []
      )
        .map((id) => centerXOf.get(id))
        .filter((x): x is number => x !== undefined)
      if (spouseCenters.length < 2) continue
      // 配偶者の中心どうしの範囲に収めるだけでは足りない。端の配偶者側へ寄ると、
      // 子への系線が「婚姻線の真ん中」ではなく「その人物のカード」から出ているように見える
      expect(familyPos.x).toBeCloseTo(
        (Math.min(...spouseCenters) + Math.max(...spouseCenters)) / 2,
      )
    }

    // 親子線の始点(結合点)が婚姻線の経路上にあることを、経路そのもので確かめる
    for (const link of result.links) {
      if (link.kind !== 'parent-child') continue
      const marriage = result.links.find(
        (l) => l.kind === 'marriage' && l.familyId === link.familyId,
      )
      if (!marriage) continue
      const xs = marriage.points.map((p) => p.x)
      expect(link.points[0].y).toBe(marriage.points[0].y)
      expect(link.points[0].x).toBeGreaterThanOrEqual(Math.min(...xs))
      expect(link.points[0].x).toBeLessThanOrEqual(Math.max(...xs))
    }
  })

  it('子たちが夫婦の外側に寄っていても、結合点はカードとカードのあいだに残る', () => {
    // 子の中央が夫婦の範囲の外にあると、結合点が端の配偶者の中心へ寄り切り、
    // 子への系線がその人物のカードから直接出ているように見える(実機で報告された)
    const doc = testDoc(
      [
        person('husband', '夫'),
        person('wife', '妻'),
        person('child', '子'),
        person('childSpouse', '子の配偶者'),
        person('other1', '無関係1'),
        person('other2', '無関係2'),
        person('otherChild', '無関係の子'),
      ],
      [
        family(
          'fCouple',
          ['husband', 'wife'],
          [{ childId: 'child', pedigree: 'biological' }],
        ),
        // 子を別の家系と婚姻させ、層1の中で夫婦の真下から離れた位置へ引っぱる
        family('fChildMarriage', ['child', 'childSpouse'], []),
        family(
          'fOther',
          ['other1', 'other2'],
          [{ childId: 'otherChild', pedigree: 'biological' }],
        ),
      ],
    )
    const { result } = layoutOf(doc)
    const centerXOf = new Map(
      result.persons.map((p) => [p.personId, p.x + CARD_SIZE.width / 2]),
    )
    const unionX = result.families.find((f) => f.familyId === 'fCouple')!.x
    const left = Math.min(centerXOf.get('husband')!, centerXOf.get('wife')!)
    const right = Math.max(centerXOf.get('husband')!, centerXOf.get('wife')!)

    // 隙間の中に入っているだけでは足りない。どちらかのカードに接するまで寄ると、
    // 系線がその人物から直接出ているように見える。ちょうど真ん中であることを求める
    expect(unionX).toBeCloseTo((left + right) / 2)
  })

  it('層が離れた子より、隣の層の子のほうが親を強く引く', () => {
    // 婚入して数世代下へ移った子は図の反対側に置かれることがある。そこへ等しく引かれると、
    // 実家とその近い世代の子たちまでまとめて引きずられ、他家の真上へ入り込んでしまう
    const doc = testDoc(
      [
        person('p1', '親1'),
        person('p2', '親2'),
        person('near1', '隣の層の子1'),
        person('near2', '隣の層の子2'),
        person('far', '数世代下へ嫁いだ子'),
        // 遠くの家系。farはこの家系の孫と婚姻して層2まで下がる
        person('o1', '他家1'),
        person('o2', '他家2'),
        person('oChild', '他家の子'),
        person('oGrand', '他家の孫'),
      ],
      [
        family(
          'fParents',
          ['p1', 'p2'],
          [
            { childId: 'near1', pedigree: 'biological' },
            { childId: 'near2', pedigree: 'biological' },
            { childId: 'far', pedigree: 'biological' },
          ],
        ),
        family(
          'fOther',
          ['o1', 'o2'],
          [{ childId: 'oChild', pedigree: 'biological' }],
        ),
        family(
          'fOtherChild',
          ['oChild'],
          [{ childId: 'oGrand', pedigree: 'biological' }],
        ),
        family('fFar', ['oGrand', 'far'], []),
      ],
    )
    const { generationOf, result } = layoutOf(doc)
    expect(generationOf.get('near1')).toBe(1)
    expect(generationOf.get('far')).toBe(2) // 前提: きょうだいが別々の層にいる

    const centerXOf = new Map(
      result.persons.map((p) => [p.personId, p.x + CARD_SIZE.width / 2]),
    )
    const parentsCenter = (centerXOf.get('p1')! + centerXOf.get('p2')!) / 2
    const nearCenter = (centerXOf.get('near1')! + centerXOf.get('near2')!) / 2
    const farCenter = centerXOf.get('far')!

    // 親は、遠くへ嫁いだ子より隣の層の子たちの近くに置かれる
    expect(Math.abs(parentsCenter - nearCenter)).toBeLessThan(
      Math.abs(parentsCenter - farCenter),
    )
  })

  it('配偶者が1人の家族は、その人物の中心から系線が出る', () => {
    // 婚姻線が無いので「あいだ」が存在しない。カードの中心から出るのが自然
    const doc = testDoc(
      [
        person('soleParent', 'ひとり親'),
        person('c1', '子1'),
        person('c2', '子2'),
      ],
      [
        family(
          'f1',
          ['soleParent'],
          [
            { childId: 'c1', pedigree: 'biological' },
            { childId: 'c2', pedigree: 'biological' },
          ],
        ),
      ],
    )
    const { result } = layoutOf(doc)
    const parent = result.persons.find((p) => p.personId === 'soleParent')!
    expect(result.families.find((f) => f.familyId === 'f1')!.x).toBe(
      parent.x + CARD_SIZE.width / 2,
    )
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
        family(
          'fHusbandParents',
          ['hFather', 'hMother'],
          [{ childId: 'husband', pedigree: 'biological' }],
        ),
        family(
          'fWifeParents',
          ['wFather', 'wMother'],
          [{ childId: 'wife', pedigree: 'biological' }],
        ),
        family('fMarriage', ['husband', 'wife'], []),
      ],
    )
    const { result } = layoutOf(doc)
    const centerXOf = new Map(
      result.persons.map((p) => [p.personId, p.x + CARD_SIZE.width / 2]),
    )

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
      [
        person('bioParent', '実親'),
        person('adoptiveParent', '養親'),
        person('d', 'D'),
      ],
      [
        family(
          'fBio',
          ['bioParent'],
          [{ childId: 'd', pedigree: 'biological' }],
        ),
        family(
          'fAdoptive',
          ['adoptiveParent'],
          [{ childId: 'd', pedigree: 'adopted' }],
        ),
      ],
    )
    const { result } = layoutOf(doc)

    const dPositions = result.persons.filter((p) => p.personId === 'd')
    expect(dPositions).toHaveLength(1)

    const linksToD = result.links.filter(
      (l) => l.kind === 'parent-child' && l.childId === 'd',
    )
    expect(linksToD).toHaveLength(2)
    const pedigrees = linksToD
      .map((l) => l.kind === 'parent-child' && l.pedigree)
      .sort()
    expect(pedigrees).toEqual(['adopted', 'biological'])

    // 2本が同じ高さで折れると重なって片方が見えなくなる(実機で実子の線が養子の線を隠していた)。
    // 横に走る区間の高さが互いに異なることを確かめる
    const midYs = linksToD.map((l) => l.points[1].y)
    expect(new Set(midYs).size).toBe(2)
  })

  it('横に重なる別々の家族の親子線には、違うレーン(横に走る高さ)が割り当てられる', () => {
    // どの家族も同じ高さで折れると、無関係な家族の横線どうしが一直線につながって見え、
    // 図が読めなくなる(実データで8家族ぶんの横線が1本の長い棒に見えた)
    const lanes = assignLinkLanes(
      new Map([
        [
          0,
          [
            { key: 'fA', left: 0, right: 500 },
            { key: 'fB', left: 200, right: 700 }, // fAと重なる
            { key: 'fC', left: 900, right: 1000 }, // どちらとも重ならない
          ],
        ],
      ]),
    )

    expect(lanes.get('fA')?.lane).not.toBe(lanes.get('fB')?.lane)
    // 重ならない家族はレーンを使い回す(隙間を細かく分割しすぎないため)
    expect(lanes.get('fC')?.lane).toBe(lanes.get('fA')?.lane)
    expect(lanes.get('fA')?.laneCount).toBe(2)
  })

  it('レーンの割り当ては区間の左端・家族IDで決まり、入力順に依存しない', () => {
    const intervals = [
      { key: 'fB', left: 200, right: 700 },
      { key: 'fA', left: 0, right: 500 },
      { key: 'fC', left: 900, right: 1000 },
    ]
    const forward = assignLinkLanes(new Map([[0, intervals]]))
    const reversed = assignLinkLanes(new Map([[0, [...intervals].reverse()]]))
    expect([...reversed.entries()].sort()).toEqual(
      [...forward.entries()].sort(),
    )
  })

  it('層をまたぐ親子線は、子のすぐ上の隙間で横に走る', () => {
    // 婚入して数世代下へ移った人物の親子線を親のすぐ下の隙間へ置くと、その横線が
    // 上の層の混み合った隙間を端から端まで横断してしまう(実データで発生)。
    // 子のすぐ上に置けば、長い移動は縦線が受け持ち、横線は子の真上だけに現れる
    const doc = testDoc(
      [
        person('gf', '祖父'),
        person('gm', '祖母'),
        person('near', '近い子'),
        person('nearSpouse', '近い子の配偶者'),
        person('grandchild', '孫'),
        person('far', '遠い子'),
      ],
      [
        family(
          'fTop',
          ['gf', 'gm'],
          [
            { childId: 'near', pedigree: 'biological' },
            // 孫の世代の人物と婚姻することで、この子だけが2層下へ引き下げられる
            { childId: 'far', pedigree: 'biological' },
          ],
        ),
        family(
          'fNear',
          ['near', 'nearSpouse'],
          [{ childId: 'grandchild', pedigree: 'biological' }],
        ),
        family('fFar', ['grandchild', 'far'], []),
      ],
    )
    const { generationOf, result } = layoutOf(doc)

    expect(generationOf.get('near')).toBe(1)
    expect(generationOf.get('far')).toBe(2) // 前提: 同じ家族の子が別々の層にいる

    const laneYOf = (childId: string) =>
      result.links.find(
        (l) => l.kind === 'parent-child' && l.childId === childId,
      )?.points[1].y

    // それぞれの横線は、その子の層のすぐ上の隙間にある
    for (const childId of ['near', 'far']) {
      const childGeneration = generationOf.get(childId) ?? 0
      const childTop = childGeneration * (CARD_SIZE.height + VERTICAL_GAP)
      expect(laneYOf(childId)).toBeGreaterThan(childTop - VERTICAL_GAP)
      expect(laneYOf(childId)).toBeLessThan(childTop)
    }
    // 同じ家族でも子の層が違えば別の高さで横に走る
    expect(laneYOf('near')).not.toBe(laneYOf('far'))
  })

  it('重婚では婚姻線が他人のカードを貫通せず、子の系線は自分の家族の結合点から出る', () => {
    // 監査の再現構成: hがw1(m1)ともw2(m2)とも婚姻し、m2に子cがいる。修正前は並びが
    // [h,w1,w2]になり、m2の婚姻線がw1のカードを貫通し、m2の結合点がw1のカード中心に
    // 一致して、cの系線がw1から出ているように見えた
    const doc = testDoc(
      [
        person('h', '夫'),
        person('w1', '妻1'),
        person('w2', '妻2'),
        person('c', '子'),
      ],
      [
        family('m1', ['h', 'w1'], []),
        family('m2', ['h', 'w2'], [{ childId: 'c', pedigree: 'biological' }]),
      ],
    )
    const { result } = layoutOf(doc)

    // (a) どの系線のどの線分も、他人のカードの矩形と交差しない
    // (b) 結合点が他人のカードの矩形内に落ちない
    expectLayoutInvariants(result, doc)

    // (c) 子cへの線の始点はm2の結合点そのもの
    const m2Position = result.families.find((f) => f.familyId === 'm2')!
    const linkToC = result.links.find(
      (l) => l.kind === 'parent-child' && l.childId === 'c',
    )!
    expect(linkToC.points[0].x).toBe(m2Position.x)
    expect(linkToC.points[0].y).toBe(m2Position.y)
  })

  it('隣接できない配偶者の婚姻線はレーン経由のエルボーになり、結合点も水平区間の中点に乗る', () => {
    // 3重婚。hの隣は2枠しかないため、どう並べても1つの婚姻は間に他人のカードを挟む。
    // その婚姻線は「各カードの中心から下のレーンへ降ろし、レーン上を水平に結ぶ」形になる
    const doc = testDoc(
      [
        person('h', '夫'),
        person('w1', '妻1'),
        person('w2', '妻2'),
        person('w3', '妻3'),
      ],
      [
        family('m1', ['h', 'w1'], []),
        family('m2', ['h', 'w2'], []),
        family('m3', ['h', 'w3'], []),
      ],
    )
    const { result } = layoutOf(doc)

    expectLayoutInvariants(result, doc)

    const marriages = result.links.filter((l) => l.kind === 'marriage')
    expect(marriages).toHaveLength(3)
    const elbows = marriages.filter((l) => l.points.length === 4)
    expect(elbows.length).toBeGreaterThanOrEqual(1) // 少なくとも1つはエルボーで引くしかない

    const rowBottom = CARD_SIZE.height
    for (const elbow of elbows) {
      // 水平区間は層0と層1のあいだの隙間にある
      expect(elbow.points[1].y).toBe(elbow.points[2].y)
      expect(elbow.points[1].y).toBeGreaterThan(rowBottom)
      expect(elbow.points[1].y).toBeLessThan(rowBottom + VERTICAL_GAP)
      // 両端はそれぞれの配偶者のカード中心から降りる
      expect(elbow.points[0].x).toBe(elbow.points[1].x)
      expect(elbow.points[3].x).toBe(elbow.points[2].x)
      // 結合点は水平区間の中点に乗る
      const familyPos = result.families.find(
        (f) => f.familyId === elbow.familyId,
      )!
      expect(familyPos.x).toBeCloseTo(
        (elbow.points[1].x + elbow.points[2].x) / 2,
      )
      expect(familyPos.y).toBe(elbow.points[1].y)
    }
  })

  it('層をまたぐ縦線は、中間層のカードを避けて隣の隙間へスナップされる', () => {
    // gf-gm夫婦の子はmid(層1)とfar(層2へ婚出)。層1にはmidの一族(mid・midChild・
    // midChild2)がいるため、緩和でmidは夫婦の真下(=結合点の真下)へ寄り、farへの
    // 縦線をそのまま降ろすとmidのカードを縦に貫通する(監査指摘)。修正後はmidの脇の
    // 隙間へスナップされる。midChild2は「結合点がmidの真上に来る」という前提を
    // HORIZONTAL_GAPの値によらず成立させるための補助的な子(fix-marriage-label-
    // spacing-selectionでHORIZONTAL_GAPが24→80へ広がった際、midChild2なしでは
    // 結合点がmidのカード幅からわずかに外れてしまい前提が崩れたため追加した)
    const doc = testDoc(
      [
        person('gf', '祖父'),
        person('gm', '祖母'),
        person('mid', '中間の子'),
        person('midChild', '中間の孫'),
        person('midChild2', '中間の孫2'),
        person('far', '婚出した子'),
      ],
      [
        family(
          'fTop',
          ['gf', 'gm'],
          [
            { childId: 'mid', pedigree: 'biological' },
            { childId: 'far', pedigree: 'biological' },
          ],
        ),
        family(
          'fMid',
          ['mid'],
          [
            { childId: 'midChild', pedigree: 'biological' },
            { childId: 'midChild2', pedigree: 'biological' },
          ],
        ),
        family('fFar', ['midChild', 'far'], []),
      ],
    )
    const { generationOf, result } = layoutOf(doc)
    expect(generationOf.get('far')).toBe(2) // 前提: farへの親子線が層1の行を通過する

    expectLayoutInvariants(result, doc)

    // スナップが実際に働いたことも確かめる(midの真上に結合点がある前提の構成なので、
    // 縦線のxは結合点のxから外れているはず)
    const farLink = result.links.find(
      (l) => l.kind === 'parent-child' && l.childId === 'far',
    )!
    const unionX = result.families.find((f) => f.familyId === 'fTop')!.x
    const mid = result.persons.find((p) => p.personId === 'mid')!
    expect(unionX).toBeGreaterThan(mid.x)
    expect(unionX).toBeLessThan(mid.x + CARD_SIZE.width) // 前提: 結合点はmidのカードの真上
    const verticalXs = new Set(
      farLink.points
        .slice(0, -1)
        .flatMap((p, i) => (p.x === farLink.points[i + 1].x ? [p.x] : [])),
    )
    expect([...verticalXs].some((x) => x !== unionX)).toBe(true)
  })

  it('配偶者が1人も実在しない家族の子でも、結合点と系線が図の範囲(0以上)に収まる', () => {
    // 監査のトレース: spouseIds:['ghost']は欠損参照の除去で空になり、世代が「子の層-1 = -1」
    // となって結合点と系線が負のy座標に落ちていた。世代は0へクランプし、結合点は
    // 子の層のすぐ上のレーン帯に置き、全体を平行移動して0以上へ正規化する
    const doc = testDoc(
      [person('c1', '子1'), person('c2', '子2')],
      [
        family(
          'f1',
          ['ghost'],
          [
            { childId: 'c1', pedigree: 'biological' },
            { childId: 'c2', pedigree: 'biological' },
          ],
        ),
      ],
    )
    const { result } = layoutOf(doc)

    expectPointsWithinBounds(result)
    expectLinksAvoidForeignCards(result, doc)

    const familyPos = result.families.find((f) => f.familyId === 'f1')!
    expect(familyPos.generation).toBe(0) // -1へ落とさない
    expect(familyPos.y).toBeGreaterThanOrEqual(0)
    // 結合点は子の層(カード上端)より上のレーン帯にある
    const childTop = result.persons.find((p) => p.personId === 'c1')!.y
    expect(familyPos.y).toBeLessThan(childTop)
    // 系線は結合点から出て子のカード上端で受ける
    for (const link of result.links) {
      if (link.kind !== 'parent-child') continue
      expect(link.points[0].x).toBe(familyPos.x)
      expect(link.points[0].y).toBe(familyPos.y)
      expect(link.points[link.points.length - 1].y).toBe(childTop)
    }
  })

  it('世代の割り当てが割れた配偶者どうしも、それぞれの行から縦線で結ばれる', () => {
    // 世代方向の循環(w2の下にx、xの下にw2)があると割り当ては収束せず、家族の走査順に
    // よってはm1の配偶者h,w1の層が割れたまま打ち切られる。婚姻線はエルボーと同じ機構で
    // 「各配偶者の点をそれぞれの行の高さで打ち、縦線で接続する」
    const doc = testDoc(
      [
        person('h', '夫'),
        person('w1', '妻1'),
        person('w2', '妻2'),
        person('x', '子'),
      ],
      [
        family('fc1', ['w2'], [{ childId: 'x', pedigree: 'biological' }]),
        family('fc2', ['x'], [{ childId: 'w2', pedigree: 'biological' }]),
        family('m1', ['h', 'w1'], []),
        family('m2', ['h', 'w2'], []),
      ],
    )
    const { generationOf, result } = layoutOf(doc)
    expect(generationOf.get('h')).not.toBe(generationOf.get('w1')) // 前提: 層が割れている

    const m1Link = result.links.find(
      (l) => l.kind === 'marriage' && l.familyId === 'm1',
    )!
    expect(m1Link.points).toHaveLength(4)
    const byId = new Map(result.persons.map((p) => [p.personId, p]))
    const first = m1Link.points[0]
    const last = m1Link.points[3]
    // 両端はそれぞれの配偶者のカード中心の高さにある(行が違うのでyも違う)
    const centers = [byId.get('h')!, byId.get('w1')!]
      .map((p) => p.y + CARD_SIZE.height / 2)
      .sort((a, b) => a - b)
    expect([first.y, last.y].sort((a, b) => a - b)).toEqual(centers)
    // 中間は水平区間(縦線で降ろした先のレーン)
    expect(m1Link.points[1].y).toBe(m1Link.points[2].y)
    expectPointsWithinBounds(result)
  })

  it('親子線が横に走る高さは、必ず層と層の隙間に収まる', () => {
    // カードの並ぶ高さを横切ると、カードの隙間ごとに線が途切れて見え、図が読みづらくなる
    const doc = testDoc(
      [
        person('gf', '祖父'),
        person('gm', '祖母'),
        person('father', '父'),
        person('mother', '母'),
        person('child', '孫'),
      ],
      [
        family(
          'f1',
          ['gf', 'gm'],
          [{ childId: 'father', pedigree: 'biological' }],
        ),
        family(
          'f2',
          ['father', 'mother'],
          [{ childId: 'child', pedigree: 'biological' }],
        ),
      ],
    )
    const { generationOf, result } = layoutOf(doc)

    for (const link of result.links) {
      if (link.kind !== 'parent-child') continue
      const parentGeneration =
        result.families.find((f) => f.familyId === link.familyId)?.generation ??
        0
      const rowBottom =
        parentGeneration * (CARD_SIZE.height + VERTICAL_GAP) + CARD_SIZE.height
      const laneY = link.points[1].y
      expect(laneY).toBeGreaterThan(rowBottom)
      expect(laneY).toBeLessThan(rowBottom + VERTICAL_GAP)
      // 子の側はカードの上端で受ける(カードの上に線が重ならない)
      const childGeneration = generationOf.get(link.childId) ?? 0
      expect(link.points[3].y).toBe(
        childGeneration * (CARD_SIZE.height + VERTICAL_GAP),
      )
    }
  })
})

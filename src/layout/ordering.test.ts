import { describe, expect, it } from 'vitest'
import type { PersonId } from '../domain/types'
import { assignGenerations } from './generations'
import { buildGraph, type PedigreeGraph } from './graph'
import {
  buildInitialOrder,
  countCrossings,
  orderWithinLayers,
  type LayerOrder,
} from './ordering'
import { family, person, testDoc } from './test-fixtures'

describe('buildInitialOrder', () => {
  it('夫婦が常に隣接し、きょうだいが連続して並ぶ', () => {
    const doc = testDoc(
      [
        person('gf', '祖父'),
        person('gm', '祖母'),
        person('c1', '子1'),
        person('c2', '子2'),
        person('c3', '子3'),
        person('s1', '子1の配偶者'),
      ],
      [
        family(
          'fParents',
          ['gf', 'gm'],
          [
            { childId: 'c1', pedigree: 'biological' },
            { childId: 'c2', pedigree: 'biological' },
            { childId: 'c3', pedigree: 'biological' },
          ],
        ),
        family('fMarriage', ['c1', 's1'], []),
      ],
    )
    const graph = buildGraph(doc)
    const { generationOf } = assignGenerations(graph)
    const order = buildInitialOrder(graph, generationOf)
    const gen1 = order.get(1) ?? []

    expect(gen1).toHaveLength(4)
    // 夫婦(c1, s1)は常に隣接する
    const c1Index = gen1.indexOf('c1')
    const s1Index = gen1.indexOf('s1')
    expect(Math.abs(c1Index - s1Index)).toBe(1)
    // きょうだい(c1, c2, c3)は他人に割り込まれず連続する区間に収まる
    const indices = [
      c1Index,
      s1Index,
      gen1.indexOf('c2'),
      gen1.indexOf('c3'),
    ].sort((a, b) => a - b)
    expect(indices).toEqual([0, 1, 2, 3])
  })

  it('出生順(birthOrder)に基づいて兄弟が並ぶ(design.md D3)', () => {
    const doc = testDoc(
      [
        person('gf', '祖父'),
        person('gm', '祖母'),
        { ...person('c1', '子1'), birthOrder: 2 },
        { ...person('c2', '子2'), birthOrder: 1 },
      ],
      [
        family(
          'fParents',
          ['gf', 'gm'],
          [
            { childId: 'c1', pedigree: 'biological' },
            { childId: 'c2', pedigree: 'biological' },
          ],
        ),
      ],
    )
    const graph = buildGraph(doc)
    const { generationOf } = assignGenerations(graph)
    const order = buildInitialOrder(graph, generationOf)
    const gen1 = order.get(1) ?? []

    expect(gen1.indexOf('c2')).toBeLessThan(gen1.indexOf('c1'))
  })

  it('出生順が生年より優先される(出生順不明・生年判明の子より、出生順判明・生年不明の子が前に来る)', () => {
    const doc = testDoc(
      [
        person('gf', '祖父'),
        person('gm', '祖母'),
        { ...person('c1', '子1'), birthOrder: 1 },
        {
          ...person('c2', '子2'),
          birth: {
            type: 'birth' as const,
            date: {
              original: '1955年',
              qualifier: 'exact' as const,
              date: { year: 1955 },
            },
          },
        },
      ],
      [
        family(
          'fParents',
          ['gf', 'gm'],
          [
            // 登録順ではc2が先だが、出生順が優先されるためc1が前に来る
            { childId: 'c2', pedigree: 'biological' },
            { childId: 'c1', pedigree: 'biological' },
          ],
        ),
      ],
    )
    const graph = buildGraph(doc)
    const { generationOf } = assignGenerations(graph)
    const order = buildInitialOrder(graph, generationOf)
    const gen1 = order.get(1) ?? []

    expect(gen1.indexOf('c1')).toBeLessThan(gen1.indexOf('c2'))
  })
})

describe('orderWithinLayers: 重心法による交差削減', () => {
  it('交差が発生する構成で、往復前より交差数が減る', () => {
    // aa夫婦の子(c1, c4)とbb夫婦の子(c3, c2)が、家族内の登録順(fCouple2はc3,c2の順)の都合で
    // 初期順序に交差を生む構成。c1とc3が婚姻しているため、両者は1つの単位として隣接する
    const doc = testDoc(
      [
        person('aa1', 'AA1'),
        person('aa2', 'AA2'),
        person('bb1', 'BB1'),
        person('bb2', 'BB2'),
        person('c1', 'C1'),
        person('c2', 'C2'),
        person('c3', 'C3'),
        person('c4', 'C4'),
      ],
      [
        family(
          'fCouple1',
          ['aa1', 'aa2'],
          [
            { childId: 'c1', pedigree: 'biological' },
            { childId: 'c4', pedigree: 'biological' },
          ],
        ),
        family(
          'fCouple2',
          ['bb1', 'bb2'],
          [
            { childId: 'c3', pedigree: 'biological' },
            { childId: 'c2', pedigree: 'biological' },
          ],
        ),
        family('fMarriage', ['c1', 'c3'], []),
      ],
    )
    const graph = buildGraph(doc)
    const { generationOf } = assignGenerations(graph)

    const before = buildInitialOrder(graph, generationOf)
    const after = orderWithinLayers(graph, generationOf)

    const crossingsBefore = countCrossings(before, graph, generationOf)
    const crossingsAfter = countCrossings(after, graph, generationOf)

    expect(crossingsBefore).toBeGreaterThan(0)
    expect(crossingsAfter).toBeLessThan(crossingsBefore)
  })
})

describe('レイアウトの決定性(D5)', () => {
  it('同一ドキュメントに対して2回並び替えても完全に一致する', () => {
    const doc = testDoc(
      [
        person('gf', '祖父'),
        person('gm', '祖母'),
        person('c1', '子1'),
        person('c2', '子2'),
        person('c3', '子3'),
        person('s1', '配偶者'),
      ],
      [
        family(
          'fParents',
          ['gf', 'gm'],
          [
            { childId: 'c1', pedigree: 'biological' },
            { childId: 'c2', pedigree: 'biological' },
            { childId: 'c3', pedigree: 'biological' },
          ],
        ),
        family('fMarriage', ['c2', 's1'], []),
      ],
    )
    const graph = buildGraph(doc)
    const { generationOf } = assignGenerations(graph)

    const order1 = orderWithinLayers(graph, generationOf)
    const order2 = orderWithinLayers(graph, generationOf)

    expect([...order1.entries()]).toEqual([...order2.entries()])
  })
})

describe('重婚(複数の家族に属する配偶者)の並び替え', () => {
  it('重婚者は配偶者たちの間に置かれる(婚姻線が他人のカードをまたがない並び)', () => {
    // 監査の再現構成: hがw1(m1)ともw2(m2)とも婚姻している。単位にまとまるのはm1の(h,w1)
    // だけなので、婚姻辺を採点に入れないと[h,w1,w2]のような並びが残り、m2の婚姻線が
    // w1のカードを貫通する。w1–h–w2(または鏡像)の並びなら両方の婚姻線が隣接で引ける
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
    const graph = buildGraph(doc)
    const { generationOf } = assignGenerations(graph)
    const order = orderWithinLayers(graph, generationOf)
    const gen0 = order.get(0) ?? []

    expect(gen0).toHaveLength(3)
    const hIndex = gen0.indexOf('h')
    const w1Index = gen0.indexOf('w1')
    const w2Index = gen0.indexOf('w2')
    // hが両方の配偶者と隣接する = hが真ん中
    expect(Math.abs(hIndex - w1Index)).toBe(1)
    expect(Math.abs(hIndex - w2Index)).toBe(1)
  })
})

describe('countCrossings: 旧実装(全ペア比較)との同値性', () => {
  /**
   * 置き換え前のO(E^2)実装の参照コピー。「(親位置の差)×(子位置の差)が負のペアだけを1と数え、
   * 端点(親位置または子位置)を共有するペアは数えない」という意味論の基準として保持する
   */
  function referenceCountCrossings(
    order: LayerOrder,
    graph: PedigreeGraph,
    generationOf: Map<PersonId, number>,
  ): number {
    let total = 0
    const generations = [...order.keys()].sort((a, b) => a - b)

    for (const generation of generations) {
      const childGeneration = generation + 1
      const parentIds = order.get(generation)
      const childIds = order.get(childGeneration)
      if (!parentIds || !childIds) continue
      const parentPositions = new Map(parentIds.map((id, index) => [id, index]))
      const childPositions = new Map(childIds.map((id, index) => [id, index]))

      const edges: Array<[number, number]> = []
      for (const f of graph.families.values()) {
        const spousePositions = f.spouseIds
          .map((id) => parentPositions.get(id))
          .filter((p): p is number => p !== undefined)
        if (spousePositions.length === 0) continue
        const parentPosition =
          spousePositions.reduce((sum, p) => sum + p, 0) /
          spousePositions.length
        for (const child of f.children) {
          if ((generationOf.get(child.childId) ?? -1) !== childGeneration)
            continue
          const childPosition = childPositions.get(child.childId)
          if (childPosition === undefined) continue
          edges.push([parentPosition, childPosition])
        }
      }

      for (let i = 0; i < edges.length; i++) {
        for (let j = i + 1; j < edges.length; j++) {
          const [p1, c1] = edges[i]
          const [p2, c2] = edges[j]
          if ((p1 - p2) * (c1 - c2) < 0) total += 1
        }
      }
    }

    return total
  }

  /**
   * 親アンカー3種(単身p0・夫婦(p1,p2)・単身p3)× 子3人の9通りの辺から、部分集合で
   * 辺集合を組み立てる。夫婦のアンカーは位置の平均(小数)になるため、整数位置どうしだけでは
   * 通らない経路(同値・共有端点の扱い)も踏む
   */
  function edgeCaseDoc(edges: Array<[number, number]>) {
    const parents = ['p0', 'p1', 'p2', 'p3']
    const childIds = ['c0', 'c1', 'c2']
    const anchors: PersonId[][] = [['p0'], ['p1', 'p2'], ['p3']]
    const families = [family('fCouple', ['p1', 'p2'], [])]
    edges.forEach(([anchorIndex, childIndex], i) => {
      families.push(
        family(`f${String(i).padStart(2, '0')}`, anchors[anchorIndex], [
          { childId: childIds[childIndex], pedigree: 'biological' },
        ]),
      )
    })
    return testDoc(
      [...parents, ...childIds].map((id) => person(id, id)),
      families,
    )
  }

  it('9通りの辺の全部分集合(511ケース)で旧実装と一致する', () => {
    const universe: Array<[number, number]> = []
    for (let a = 0; a < 3; a++)
      for (let c = 0; c < 3; c++) universe.push([a, c])

    const order: LayerOrder = new Map([
      [0, ['p0', 'p1', 'p2', 'p3']],
      [1, ['c0', 'c1', 'c2']],
    ])
    const generationOf = new Map<PersonId, number>([
      ['p0', 0],
      ['p1', 0],
      ['p2', 0],
      ['p3', 0],
      ['c0', 1],
      ['c1', 1],
      ['c2', 1],
    ])

    for (let mask = 1; mask < 1 << universe.length; mask++) {
      const edges = universe.filter((_, i) => (mask & (1 << i)) !== 0)
      const graph = buildGraph(edgeCaseDoc(edges))
      expect(
        countCrossings(order, graph, generationOf),
        `辺集合 ${JSON.stringify(edges)} で旧実装と食い違う`,
      ).toBe(referenceCountCrossings(order, graph, generationOf))
    }
  })

  it('同一の辺が重複するケースでも旧実装と一致する', () => {
    // 部分集合の列挙では同じ辺を2本にできないため、別の家族から同じ(親,子)へ引くケースを
    // 明示的に確かめる。共有端点(積が0)のペアを交差に数えない意味論の確認でもある
    const duplicated: Array<Array<[number, number]>> = [
      [
        [0, 0],
        [0, 0],
      ],
      [
        [0, 1],
        [0, 1],
        [1, 0],
      ],
      [
        [0, 2],
        [1, 1],
        [1, 1],
        [2, 0],
      ],
    ]
    const order: LayerOrder = new Map([
      [0, ['p0', 'p1', 'p2', 'p3']],
      [1, ['c0', 'c1', 'c2']],
    ])
    const generationOf = new Map<PersonId, number>([
      ['p0', 0],
      ['p1', 0],
      ['p2', 0],
      ['p3', 0],
      ['c0', 1],
      ['c1', 1],
      ['c2', 1],
    ])
    for (const edges of duplicated) {
      const graph = buildGraph(edgeCaseDoc(edges))
      expect(countCrossings(order, graph, generationOf)).toBe(
        referenceCountCrossings(order, graph, generationOf),
      )
    }
  })
})

describe('層をまたぐ関係の並び替え', () => {
  it('実家が2層以上離れた人物の親も、子の近くへ寄せられる', () => {
    // 婚入した配偶者は相手の層へ引き上げ/引き下げられるため、その実家が2層以上離れることがある。
    // 隣の層だけを基準にすると、その実家は「基準が無い」と判定されて層の末尾へ固定され、
    // 図の端から端まで走る長い系線が生まれる(実データで発生)
    const doc = testDoc(
      [
        person('a1', 'A1'),
        person('a2', 'A2'),
        person('achild', 'Aの子'),
        person('agrand', 'Aの孫'),
        person('inlaw', '孫の配偶者'),
        person('f1', '孫の配偶者の父'),
        person('f2', '孫の配偶者の母'),
      ],
      [
        family(
          'fA',
          ['a1', 'a2'],
          [{ childId: 'achild', pedigree: 'biological' }],
        ),
        family(
          'fChild',
          ['achild'],
          [{ childId: 'agrand', pedigree: 'biological' }],
        ),
        family('fGrand', ['agrand', 'inlaw'], []),
        // inlawの実家は層0にあるが、inlaw自身はagrandに合わせて層2へ下がる
        family(
          'fInlaw',
          ['f1', 'f2'],
          [{ childId: 'inlaw', pedigree: 'biological' }],
        ),
      ],
    )
    const graph = buildGraph(doc)
    const { generationOf } = assignGenerations(graph)
    expect(generationOf.get('inlaw')).toBe(2) // 前提: 実家(層0)と2層離れている

    const order = orderWithinLayers(graph, generationOf)
    const gen0 = order.get(0) ?? []
    const gen2 = order.get(2) ?? []

    // 実家(f1/f2)が層0の末尾へ追いやられていないこと。層0はA夫婦と実家の2組しかないので、
    // 「子(inlaw)が層2のどちら側にいるか」と実家の左右が揃っていればよい
    const inlawOnLeft = gen2.indexOf('inlaw') < gen2.indexOf('agrand')
    const inlawParentsOnLeft = gen0.indexOf('f1') < gen0.indexOf('a1')
    expect(inlawParentsOnLeft).toBe(inlawOnLeft)
  })
})

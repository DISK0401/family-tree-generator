import { describe, expect, it } from 'vitest'
import { assignGenerations } from './generations'
import { buildGraph } from './graph'
import { buildInitialOrder, countCrossings, orderWithinLayers } from './ordering'
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
        family('fParents', ['gf', 'gm'], [
          { childId: 'c1', pedigree: 'biological' },
          { childId: 'c2', pedigree: 'biological' },
          { childId: 'c3', pedigree: 'biological' },
        ]),
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
    const indices = [c1Index, s1Index, gen1.indexOf('c2'), gen1.indexOf('c3')].sort((a, b) => a - b)
    expect(indices).toEqual([0, 1, 2, 3])
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
        family('fCouple1', ['aa1', 'aa2'], [
          { childId: 'c1', pedigree: 'biological' },
          { childId: 'c4', pedigree: 'biological' },
        ]),
        family('fCouple2', ['bb1', 'bb2'], [
          { childId: 'c3', pedigree: 'biological' },
          { childId: 'c2', pedigree: 'biological' },
        ]),
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
        family('fParents', ['gf', 'gm'], [
          { childId: 'c1', pedigree: 'biological' },
          { childId: 'c2', pedigree: 'biological' },
          { childId: 'c3', pedigree: 'biological' },
        ]),
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
        family('fA', ['a1', 'a2'], [{ childId: 'achild', pedigree: 'biological' }]),
        family('fChild', ['achild'], [{ childId: 'agrand', pedigree: 'biological' }]),
        family('fGrand', ['agrand', 'inlaw'], []),
        // inlawの実家は層0にあるが、inlaw自身はagrandに合わせて層2へ下がる
        family('fInlaw', ['f1', 'f2'], [{ childId: 'inlaw', pedigree: 'biological' }]),
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

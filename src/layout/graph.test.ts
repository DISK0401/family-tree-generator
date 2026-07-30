import { describe, expect, it } from 'vitest'
import { buildGraph, splitIntoComponents } from './graph'
import { family, person, testDoc } from './test-fixtures'

describe('buildGraph', () => {
  it('配偶者・子の関係から家族を結合点とするグラフを構築する', () => {
    const doc = testDoc(
      [person('husband', '夫'), person('wife', '妻'), person('child', '子')],
      [
        family(
          'f1',
          ['husband', 'wife'],
          [{ childId: 'child', pedigree: 'biological' }],
        ),
      ],
    )
    const graph = buildGraph(doc)

    expect(graph.families.get('f1')?.spouseIds.sort()).toEqual([
      'husband',
      'wife',
    ])
    expect(graph.families.get('f1')?.children).toEqual([
      { childId: 'child', pedigree: 'biological' },
    ])
    expect(graph.persons.get('husband')?.spouseFamilyIds).toEqual(['f1'])
    expect(graph.persons.get('wife')?.spouseFamilyIds).toEqual(['f1'])
    expect(graph.persons.get('child')?.parentFamilyIds).toEqual(['f1'])
  })

  it('存在しない人物IDを指す子リンクを無視し、例外を出さず残りの関係を構築する', () => {
    const doc = testDoc(
      [person('parent', '親')],
      [
        family(
          'f1',
          ['parent'],
          [{ childId: 'ghost-child', pedigree: 'biological' }],
        ),
      ],
    )

    expect(() => buildGraph(doc)).not.toThrow()
    const graph = buildGraph(doc)
    expect(graph.families.get('f1')?.children).toEqual([])
    expect(graph.persons.has('ghost-child')).toBe(false)
  })

  it('存在しない人物IDを指す配偶者参照を無視する', () => {
    const doc = testDoc(
      [person('husband', '夫')],
      [family('f1', ['husband', 'ghost-spouse'], [])],
    )

    const graph = buildGraph(doc)
    expect(graph.families.get('f1')?.spouseIds).toEqual(['husband'])
  })

  it('配偶者・子のいずれも実在しない家族は取り除かれる', () => {
    const doc = testDoc(
      [],
      [
        family(
          'f1',
          ['ghost1'],
          [{ childId: 'ghost2', pedigree: 'biological' }],
        ),
      ],
    )
    const graph = buildGraph(doc)
    expect(graph.families.has('f1')).toBe(false)
  })

  it('どの家族にも属さない孤立した人物もノードとして持つ', () => {
    const doc = testDoc([person('lonely', '孤')], [])
    const graph = buildGraph(doc)
    expect(graph.persons.has('lonely')).toBe(true)
  })

  it('同じ人物を2回指す配偶者参照は1件に一意化される', () => {
    // 欠損参照の握りつぶしと同じ「レイアウタ側の頑健性」。重複を残すと同一人物が
    // 2枚のカードに複製されうる(spec「同一人物を複製しない配置」)
    const doc = testDoc([person('a', 'A')], [family('f1', ['a', 'a'], [])])
    const graph = buildGraph(doc)
    expect(graph.families.get('f1')?.spouseIds).toEqual(['a'])
    expect(graph.persons.get('a')?.spouseFamilyIds).toEqual(['f1'])
  })

  it('同じ子を2回指す子リンクは最初の1件だけが残る', () => {
    const doc = testDoc(
      [person('p', '親'), person('c', '子')],
      [
        family(
          'f1',
          ['p'],
          [
            { childId: 'c', pedigree: 'biological' },
            { childId: 'c', pedigree: 'adopted' }, // 続柄が違っても同じ子への重複参照は不整合
          ],
        ),
      ],
    )
    const graph = buildGraph(doc)
    expect(graph.families.get('f1')?.children).toEqual([
      { childId: 'c', pedigree: 'biological' },
    ])
    expect(graph.persons.get('c')?.parentFamilyIds).toEqual(['f1'])
  })
})

describe('splitIntoComponents', () => {
  it('婚姻・親子でつながる範囲を1つの成分にまとめる', () => {
    const doc = testDoc(
      [person('a', 'A'), person('b', 'B'), person('c', 'C')],
      [family('f1', ['a', 'b'], [{ childId: 'c', pedigree: 'biological' }])],
    )
    const components = splitIntoComponents(buildGraph(doc))
    expect(components).toHaveLength(1)
    expect([...components[0].persons.keys()].sort()).toEqual(['a', 'b', 'c'])
  })

  it('互いに関係のない集団は別々の成分になり、最小人物IDの昇順で並ぶ', () => {
    const doc = testDoc(
      [person('z-lonely', '孤'), person('a1', 'A1'), person('a2', 'A2')],
      [family('f1', ['a1', 'a2'], [])],
    )
    const components = splitIntoComponents(buildGraph(doc))
    expect(components).toHaveLength(2)
    expect([...components[0].persons.keys()].sort()).toEqual(['a1', 'a2'])
    expect([...components[1].persons.keys()].sort()).toEqual(['z-lonely'])
  })
})

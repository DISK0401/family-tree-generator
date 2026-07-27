import { describe, expect, it } from 'vitest'
import { assignGenerations } from './generations'
import { buildGraph } from './graph'
import { family, person, testDoc } from './test-fixtures'

describe('assignGenerations', () => {
  it('三世代の家系で祖父母・父母・孫が上から順の層になる', () => {
    const doc = testDoc(
      [
        person('gf', '祖父'),
        person('gm', '祖母'),
        person('father', '父'),
        person('mother', '母'),
        person('child', '孫'),
      ],
      [
        family('f1', ['gf', 'gm'], [{ childId: 'father', pedigree: 'biological' }]),
        family('f2', ['father', 'mother'], [{ childId: 'child', pedigree: 'biological' }]),
      ],
    )
    const { generationOf, converged } = assignGenerations(buildGraph(doc))

    expect(converged).toBe(true)
    expect(generationOf.get('gf')).toBe(0)
    expect(generationOf.get('gm')).toBe(0)
    expect(generationOf.get('father')).toBe(1)
    expect(generationOf.get('mother')).toBe(1)
    expect(generationOf.get('child')).toBe(2)
  })

  it('婚入した配偶者(実家が未記録)は相手と同じ層に揃う', () => {
    const doc = testDoc(
      [person('gf', '祖父'), person('gm', '祖母'), person('son', '息子'), person('inLaw', '嫁')],
      [
        family('f1', ['gf', 'gm'], [{ childId: 'son', pedigree: 'biological' }]),
        family('f2', ['son', 'inLaw'], []),
      ],
    )
    const { generationOf } = assignGenerations(buildGraph(doc))
    expect(generationOf.get('son')).toBe(generationOf.get('inLaw'))
    expect(generationOf.get('inLaw')).toBe(1)
  })

  it('世代方向の循環データでも有限時間で終了し、両者を含む結果が返る', () => {
    // Aの家族(spouse=A)がBを子とし、Bの家族(spouse=B)がAを子とする循環
    const doc = testDoc(
      [person('a', 'A'), person('b', 'B')],
      [
        family('f1', ['a'], [{ childId: 'b', pedigree: 'biological' }]),
        family('f2', ['b'], [{ childId: 'a', pedigree: 'biological' }]),
      ],
    )
    const start = performance.now()
    const { generationOf, converged } = assignGenerations(buildGraph(doc))
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(2000) // 有限時間で終了する(上限に達して打ち切られる)
    expect(converged).toBe(false)
    expect(generationOf.has('a')).toBe(true)
    expect(generationOf.has('b')).toBe(true)

    // 打ち切ったときの層数がそのまま図の高さになるため、反復の上限は人数から導く。
    // 固定の大きな上限だと、カード2枚の循環データが数千層の図になってしまう
    const deepest = Math.max(...generationOf.values())
    expect(deepest).toBeLessThanOrEqual(2 * (Object.keys(doc.persons).length + 2))
  })

  it('親子が2層以上またぐ婚姻(世代の離れた婚姻)でも例外を出さない', () => {
    // gf-gm の子がfather。fatherの妹(gf-gmのもう1人の子)であるauntが、
    // fatherの孫(次の世代)にあたる人物youngと婚姻している = 世代の離れた婚姻
    const doc = testDoc(
      [
        person('gf', '祖父'),
        person('gm', '祖母'),
        person('father', '父'),
        person('aunt', '叔母'),
        person('child', '子'),
        person('young', '若い配偶者'),
      ],
      [
        family('f1', ['gf', 'gm'], [
          { childId: 'father', pedigree: 'biological' },
          { childId: 'aunt', pedigree: 'biological' },
        ]),
        family('f2', ['father'], [{ childId: 'child', pedigree: 'biological' }]),
        family('f3', ['child'], [{ childId: 'young', pedigree: 'biological' }]),
        family('f4', ['aunt', 'young'], []), // 叔母(層1)と孫世代のyoung(層3相当)の婚姻
      ],
    )

    expect(() => assignGenerations(buildGraph(doc))).not.toThrow()
    const { generationOf } = assignGenerations(buildGraph(doc))
    // 配偶者は同じ層に揃うため、叔母とyoungは同じ層になり、
    // 叔母の親(gf/gm)より確実に下、というMUST制約だけは常に保たれる
    expect(generationOf.get('aunt')).toBe(generationOf.get('young'))
    expect(generationOf.get('aunt')!).toBeGreaterThan(generationOf.get('gf')!)
  })
})

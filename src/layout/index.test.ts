import { describe, expect, it } from 'vitest'
import { CARD_SIZE } from './coordinates'
import { buildGraph, splitIntoComponents } from './graph'
import { layoutPedigree } from './index'
import { family, person, testDoc } from './test-fixtures'
import { expectLayoutInvariants } from './test-invariants'
import type { Family, Person, TreeDocument } from '../domain/types'

describe('layoutPedigree', () => {
  it('空のTreeDocumentでは空の配置と寸法0を返す', () => {
    const layout = layoutPedigree(testDoc([], []))
    expect(layout.persons).toEqual([])
    expect(layout.families).toEqual([])
    expect(layout.links).toEqual([])
    expect(layout.width).toBe(0)
    expect(layout.height).toBe(0)
  })

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
    const layout = layoutPedigree(doc)

    expect(layout.persons).toHaveLength(6)
    // 夫婦の婚姻線
    const marriageLinks = layout.links.filter((l) => l.kind === 'marriage')
    expect(
      marriageLinks.some(
        (l) =>
          l.kind === 'marriage' &&
          new Set(l.spouseIds).size === 2 &&
          l.spouseIds.includes('husband') &&
          l.spouseIds.includes('wife'),
      ),
    ).toBe(true)
    // 妻の親どうしの婚姻線
    expect(
      marriageLinks.some(
        (l) =>
          l.kind === 'marriage' &&
          l.spouseIds.includes('wFather') &&
          l.spouseIds.includes('wMother'),
      ),
    ).toBe(true)
    // 妻とその親を結ぶ系線
    const wifeParentLink = layout.links.find(
      (l) =>
        l.kind === 'parent-child' &&
        l.childId === 'wife' &&
        l.familyId === 'fWifeParents',
    )
    expect(wifeParentLink).toBeDefined()

    // 夫の実家と妻の実家が、婚姻を介して1つの連結成分として扱われたことの確認。
    // 2つの独立した成分に分かれていれば、層内の順序決定・座標割り当てが別々に行われ、
    // 成分間ギャップを挟んで横に並ぶだけになる(spec「婚姻でつながる2つの血族が1枚に収まる」)
    expect(splitIntoComponents(buildGraph(doc))).toHaveLength(1)
  })

  it('婿養子(同じ家族の子どうしが夫婦)の構成を検証する(5.2)', () => {
    const doc = testDoc(
      [
        person('p', 'P'),
        person('q', 'Q'),
        person('d', 'D(実子)'),
        person('x', 'X(婿養子)'),
      ],
      [
        family(
          'fPQ',
          ['p', 'q'],
          [
            { childId: 'd', pedigree: 'biological' },
            { childId: 'x', pedigree: 'adopted' },
          ],
        ),
        family('fDX', ['d', 'x'], []),
      ],
    )
    const layout = layoutPedigree(doc)

    expect(
      layout.persons.filter((person) => person.personId === 'd'),
    ).toHaveLength(1)
    expect(
      layout.persons.filter((person) => person.personId === 'x'),
    ).toHaveLength(1)

    const marriageLink = layout.links.find(
      (l) => l.kind === 'marriage' && l.familyId === 'fDX',
    )
    expect(
      marriageLink?.kind === 'marriage' && new Set(marriageLink.spouseIds),
    ).toEqual(new Set(['d', 'x']))

    const parentLinks = layout.links.filter(
      (l) => l.kind === 'parent-child' && l.familyId === 'fPQ',
    )
    expect(parentLinks).toHaveLength(2)
    const pedigreeByChild = new Map(
      parentLinks.map((l) => [
        l.kind === 'parent-child' && l.childId,
        l.kind === 'parent-child' && l.pedigree,
      ]),
    )
    expect(pedigreeByChild.get('d')).toBe('biological')
    expect(pedigreeByChild.get('x')).toBe('adopted')
  })

  it('ひとり親の家族を検証する: 配偶者不在を理由に失敗しない(5.3)', () => {
    const doc = testDoc(
      [person('soleParent', 'ひとり親'), person('child', '子')],
      [
        family(
          'f1',
          ['soleParent'],
          [{ childId: 'child', pedigree: 'biological' }],
        ),
      ],
    )

    expect(() => layoutPedigree(doc)).not.toThrow()
    const layout = layoutPedigree(doc)
    const link = layout.links.find(
      (l) => l.kind === 'parent-child' && l.childId === 'child',
    )
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
        family(
          'fMain',
          ['main1', 'main2'],
          [{ childId: 'mainChild', pedigree: 'biological' }],
        ),
        family('fCluster', ['cluster1', 'cluster2'], []),
      ],
    )
    const layout = layoutPedigree(doc)

    expect(layout.persons).toHaveLength(6)
    const ids = layout.persons.map((p) => p.personId).sort()
    expect(ids).toEqual(
      ['cluster1', 'cluster2', 'lonely', 'main1', 'main2', 'mainChild'].sort(),
    )

    for (let i = 0; i < layout.persons.length; i++) {
      for (let j = i + 1; j < layout.persons.length; j++) {
        const a = layout.persons[i]
        const b = layout.persons[j]
        const overlapX =
          a.x < b.x + CARD_SIZE.width && b.x < a.x + CARD_SIZE.width
        const overlapY =
          a.y < b.y + CARD_SIZE.height && b.y < a.y + CARD_SIZE.height
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
      family(
        'fParents',
        ['gf', 'gm'],
        [
          { childId: 'c1', pedigree: 'biological' },
          { childId: 'c2', pedigree: 'biological' },
          { childId: 'c3', pedigree: 'biological' },
        ],
      ),
      family(
        'fMarriage',
        ['c2', 's1'],
        [{ childId: 'g1', pedigree: 'biological' }],
      ),
    ]

    const inOrder = layoutPedigree(testDoc(ps, fs))
    const reversed = layoutPedigree(
      testDoc([...ps].reverse(), [...fs].reverse()),
    )

    expect(reversed.persons).toEqual(inOrder.persons)
    expect(reversed.families).toEqual(inOrder.families)
    expect(reversed.links).toEqual(inOrder.links)
  })

  it('重婚・層をまたぐ婚姻を含んでいても、列挙順を逆にした同内容のドキュメントと同じ座標になる(D5)', () => {
    // 監査対応で加えた経路(婚姻辺の採点・エルボー婚姻・縦線のスナップと分離)が
    // 列挙順に依存しないことを、既存のD5テストと同じ突き合わせ方で確かめる
    const ps = [
      person('h', '夫'),
      person('w1', '妻1'),
      person('w2', '妻2'),
      person('c', '子'),
      person('grand', '孫'),
      person('far', '婚出した子'),
    ]
    const fs = [
      family('m1', ['h', 'w1'], []),
      family(
        'm2',
        ['h', 'w2'],
        [
          { childId: 'c', pedigree: 'biological' },
          { childId: 'far', pedigree: 'biological' },
        ],
      ),
      family('fC', ['c'], [{ childId: 'grand', pedigree: 'biological' }]),
      family('fFar', ['grand', 'far'], []), // farは孫の層まで引き下げられ、m2からの親子線が層をまたぐ
    ]

    const inOrder = layoutPedigree(testDoc(ps, fs))
    const reversed = layoutPedigree(
      testDoc([...ps].reverse(), [...fs].reverse()),
    )

    expect(reversed.persons).toEqual(inOrder.persons)
    expect(reversed.families).toEqual(inOrder.families)
    expect(reversed.links).toEqual(inOrder.links)
  })

  it('存在しない人物への参照を含んでいても例外を出さずに配置を返す', () => {
    const doc = testDoc(
      [person('parent', '親')],
      [
        family(
          'f1',
          ['parent', 'ghost'],
          [{ childId: 'ghost-child', pedigree: 'biological' }],
        ),
      ],
    )
    expect(() => layoutPedigree(doc)).not.toThrow()
    const layout = layoutPedigree(doc)
    expect(layout.persons.map((p) => p.personId)).toEqual(['parent'])
  })

  it('実親と養親の世代が異なっていても、子は深いほうの親の下の層へ1つだけ置かれる', () => {
    // 実親は層0、養親は層2(祖父母から数えて孫の世代)。子dは実親からは層1でよいが、
    // 養親からは層3が要るため、深いほうに合わせて層3になる。実親からの系線は
    // 層1・層2の行を縦にまたぐ(spec「実親と養親の双方を持つ人物」×「世代の離れた婚姻」の複合)
    const doc = testDoc(
      [
        person('bioParent', '実親'),
        person('top', '養家の祖'),
        person('midParent', '養家の親'),
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
          'fTop',
          ['top'],
          [{ childId: 'midParent', pedigree: 'biological' }],
        ),
        family(
          'fMid',
          ['midParent'],
          [{ childId: 'adoptiveParent', pedigree: 'biological' }],
        ),
        family(
          'fAdoptive',
          ['adoptiveParent'],
          [{ childId: 'd', pedigree: 'adopted' }],
        ),
      ],
    )
    const layout = layoutPedigree(doc)

    const dPositions = layout.persons.filter((p) => p.personId === 'd')
    expect(dPositions).toHaveLength(1)
    expect(dPositions[0].generation).toBe(3)
    expect(
      layout.persons.find((p) => p.personId === 'adoptiveParent')!.generation,
    ).toBe(2)
    expect(
      layout.persons.find((p) => p.personId === 'bioParent')!.generation,
    ).toBe(0)

    const linksToD = layout.links.filter(
      (l) => l.kind === 'parent-child' && l.childId === 'd',
    )
    const pedigrees = linksToD
      .map((l) => l.kind === 'parent-child' && l.pedigree)
      .sort()
    expect(pedigrees).toEqual(['adopted', 'biological'])

    expectLayoutInvariants(layout, doc)
  })
})

/**
 * 主要なfixtureを横断して、レイアウトの不変条件(人物の複製なし・全点が図の範囲内・
 * 系線と結合点が他人のカードへ入り込まない)を検査する。観点ごとの個別テストの網から
 * 漏れる構成が出ても、ここで最低限の読み取りやすさが保たれていることを確かめる
 */
describe('レイアウトの不変条件(主要fixture横断)', () => {
  const fixtures: Array<[string, TreeDocument]> = [
    [
      '三世代と婚入',
      testDoc(
        [
          person('gf', '祖父'),
          person('gm', '祖母'),
          person('c1', '子1'),
          person('c2', '子2'),
          person('s1', '配偶者'),
          person('g1', '孫'),
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
          family(
            'fMarriage',
            ['c2', 's1'],
            [{ childId: 'g1', pedigree: 'biological' }],
          ),
        ],
      ),
    ],
    [
      '重婚と子',
      testDoc(
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
      ),
    ],
    [
      '3重婚',
      testDoc(
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
      ),
    ],
    [
      '婿養子',
      testDoc(
        [
          person('p', 'P'),
          person('q', 'Q'),
          person('d', 'D'),
          person('x', 'X'),
        ],
        [
          family(
            'fPQ',
            ['p', 'q'],
            [
              { childId: 'd', pedigree: 'biological' },
              { childId: 'x', pedigree: 'adopted' },
            ],
          ),
          family('fDX', ['d', 'x'], []),
        ],
      ),
    ],
    [
      '層をまたぐ婚姻と縦線のスナップ',
      testDoc(
        [
          person('gf', '祖父'),
          person('gm', '祖母'),
          person('mid', '中間の子'),
          person('midChild', '中間の孫'),
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
            [{ childId: 'midChild', pedigree: 'biological' }],
          ),
          family('fFar', ['midChild', 'far'], []),
        ],
      ),
    ],
    [
      '配偶者が実在しない家族',
      testDoc(
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
      ),
    ],
    [
      '連結していない集団',
      testDoc(
        [
          person('main1', '本体1'),
          person('main2', '本体2'),
          person('mainChild', '本体の子'),
          person('lonely', '孤立'),
          person('cluster1', '独立1'),
          person('cluster2', '独立2'),
        ],
        [
          family(
            'fMain',
            ['main1', 'main2'],
            [{ childId: 'mainChild', pedigree: 'biological' }],
          ),
          family('fCluster', ['cluster1', 'cluster2'], []),
        ],
      ),
    ],
    ['30名の合成データ', buildSyntheticDoc(30)],
    ['300名+層をまたぐ婚姻の合成データ', buildSyntheticDoc(300, 5)],
  ]

  for (const [name, doc] of fixtures) {
    // 300名fixtureの線分×カード交差検査は重く、全ファイル並列実行のCPU競合下では
    // 既定の5秒タイムアウトを超えることがある(単独実行では4秒未満)。上限を明示する
    it(`${name} で不変条件が保たれる`, { timeout: 30_000 }, () => {
      expectLayoutInvariants(layoutPedigree(doc), doc)
    })
  }
})

/**
 * 合成データを生成する(5.4の計測用)。数世代にわたる婚姻・出生の連鎖を模す。
 * `crossMarriages`を指定すると、初代夫婦の子として新しい人物をその数だけ足し、最深世代の
 * 人物と婚姻させる(層をまたぐ婚姻)。新しい人物は相手の層まで引き下げられ、初代からの
 * 親子線が全世代を縦にまたいで走る(縦線のスナップ・レーン割り当てが実データ規模で働く
 * 経路の検証用)。既存の人物どうしを婚姻させる形にしないのは、相手が自分自身の子孫である
 * 組(=世代方向の循環)が生じて世代割り当てが収束しなくなるため。新しい人物は子孫を
 * 持たないので循環は生じない
 */
function buildSyntheticDoc(
  targetCount: number,
  crossMarriages = 0,
): TreeDocument {
  const mainCount = targetCount - crossMarriages
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

  while (persons.length < mainCount && currentCouples.length > 0) {
    const nextCouples: Array<[string, string]> = []
    for (const [a, b] of currentCouples) {
      const children: Family['children'] = []
      for (let i = 0; i < 2 && persons.length < mainCount; i++) {
        const child = addPerson()
        children.push({ childId: child, pedigree: 'biological' })
        if (persons.length < mainCount) {
          const spouseIn = addPerson()
          families.push(family(`f${familySeq++}`, [child, spouseIn], []))
          nextCouples.push([child, spouseIn])
        }
      }
      const parentFamilyId = families.find(
        (f) => f.spouseIds.includes(a) && f.spouseIds.includes(b),
      )?.id
      if (parentFamilyId) {
        const target = families.find((f) => f.id === parentFamilyId)
        if (target) target.children = children
      }
    }
    currentCouples = nextCouples
  }

  // 端数調整: 目標人数に満たない場合は、係累の記録がない人物を追加する(孤立した人物)
  while (persons.length < mainCount) addPerson()

  for (let i = 0; i < crossMarriages; i++) {
    const deep = `p${mainCount - 1 - i}`
    if (!persons.some((p) => p.id === deep)) break
    const cross = addPerson()
    families[0].children = [
      ...families[0].children,
      { childId: cross, pedigree: 'biological' },
    ]
    families.push(family(`fx${i}`, [cross, deep], []))
  }

  return testDoc(persons, families)
}

describe('layoutPedigree の計算時間(5.4)', () => {
  it('30名規模のデータを現実的な時間で計算できる', () => {
    const doc = buildSyntheticDoc(30)
    expect(Object.keys(doc.persons)).toHaveLength(30)

    const start = performance.now()
    const layout = layoutPedigree(doc)
    const elapsedMs = performance.now() - start

    console.log(
      `[layoutPedigree] 30名規模の計算時間: ${elapsedMs.toFixed(2)}ms`,
    )

    expect(layout.persons).toHaveLength(30)
    expect(elapsedMs).toBeLessThan(1000) // 回帰検知用の緩い上限。実測値はdesign.mdのRisksへ記録する
  })

  it(
    '300名規模+層をまたぐ婚姻のデータを現実的な時間で計算できる',
    { timeout: 30_000 },
    () => {
      // 交差数の計算をO(E^2)からO(E log E)へ置き換えた回帰の検知用。層をまたぐ婚姻を混ぜ、
      // 縦線のスナップ・レーン割り当てまで含めた全経路を実データ規模で通す
      const doc = buildSyntheticDoc(300, 5)
      expect(Object.keys(doc.persons)).toHaveLength(300)

      const start = performance.now()
      const layout = layoutPedigree(doc)
      const elapsedMs = performance.now() - start

      console.log(
        `[layoutPedigree] 300名規模の計算時間: ${elapsedMs.toFixed(2)}ms`,
      )

      expect(layout.persons).toHaveLength(300)
      expect(elapsedMs).toBeLessThan(2000) // 回帰検知用の緩い上限
    },
  )
})

import { describe, expect, it } from 'vitest'
import { formatDateForDisplay } from '../settings/display-settings'
import { buildGraph, splitIntoComponents } from '../layout/graph'
import { layoutPedigree } from '../layout'
import { expectLayoutInvariants } from '../layout/test-invariants'
import type { Person, TreeDocument } from '../domain/types'
import { tokugawaShogunsSample } from './data/tokugawa-shoguns'

/*
 * 徳川将軍15代サンプル(spec sample-tree-gallery)。
 * 収録範囲・系譜の連結・改暦の扱いという「このサンプル固有の要求」を機械検証する。
 * zodスキーマと参照整合性は sample-integrity.test.ts が全サンプル共通で検証する。
 */

const doc: TreeDocument = tokugawaShogunsSample

/** 15代の将軍(代数順)。人物IDで並べる */
const SHOGUN_IDS = [
  'ieyasu',
  'hidetada',
  'iemitsu',
  'ietsuna',
  'tsunayoshi',
  'ienobu',
  'ietsugu',
  'yoshimune',
  'ieshige',
  'ieharu',
  'ienari',
  'ieyoshi',
  'iesada',
  'iemochi',
  'yoshinobu',
] as const

function person(id: string): Person {
  const found = doc.persons[id]
  if (!found) throw new Error(`人物が見つからない: ${id}`)
  return found
}

describe('徳川将軍15代サンプル: 収録範囲', () => {
  it('32名が収録されている(将軍15名+分家当主15名+正室2名)', () => {
    expect(Object.keys(doc.persons)).toHaveLength(32)
  })

  it('15代の将軍全員が収録され、代数の注記を持つ', () => {
    expect(SHOGUN_IDS).toHaveLength(15)
    for (const id of SHOGUN_IDS) {
      expect(person(id).note).toMatch(/代将軍|初代/)
    }
  })

  it('配偶者を2人持つ家族が2件ある(崇源院・天璋院)', () => {
    const couples = Object.values(doc.families).filter(
      (f) => f.spouseIds.length === 2,
    )
    expect(couples).toHaveLength(2)
  })

  it('存命人物を含めないため、16代以降の宗家当主を収録していない', () => {
    const names = Object.values(doc.persons).map((p) => p.name.given)
    for (const excluded of ['家達', '家正', '恒孝', '家広']) {
      expect(names).not.toContain(excluded)
    }
  })

  it('皇室出身の人物を収録していない(spec の人選制約)', () => {
    const names = Object.values(doc.persons).map((p) => p.name.given ?? '')
    expect(names.some((n) => n.includes('和宮'))).toBe(false)
  })
})

describe('徳川将軍15代サンプル: 系譜の連結', () => {
  it('全人物が1つの連結成分に収まる(分家経由の継承も繋がっている)', () => {
    const components = splitIntoComponents(buildGraph(doc))
    expect(components).toHaveLength(1)
  })

  it('15代 慶喜から初代 家康まで親子関係で辿れる(中間世代の飛びがない)', () => {
    // childId → 親家族の配偶者たち の逆引きで祖先方向へ辿る
    const parentsOf = new Map<string, string[]>()
    for (const family of Object.values(doc.families)) {
      for (const child of family.children) {
        const parents = parentsOf.get(child.childId) ?? []
        parents.push(...family.spouseIds)
        parentsOf.set(child.childId, parents)
      }
    }

    const visited = new Set<string>()
    const queue = ['yoshinobu']
    let depth = 0
    while (queue.length > 0) {
      const id = queue.shift()
      if (id === undefined || visited.has(id)) continue
      visited.add(id)
      queue.push(...(parentsOf.get(id) ?? []))
      depth += 1
      // 循環データによる無限ループの保険(人数を超えたら異常)
      expect(depth).toBeLessThanOrEqual(Object.keys(doc.persons).length * 2)
    }
    expect(visited.has('ieyasu')).toBe(true)
    // 水戸家の歴代当主を経由していること
    for (const id of [
      'nariaki',
      'harutoshi',
      'harumori',
      'munemoto',
      'munetaka',
      'tsunaeda',
      'yorifusa',
    ]) {
      expect(visited.has(id), `慶喜の祖先に ${id} が含まれる`).toBe(true)
    }
  })

  it('分家から入嗣した将軍にも親が記録されている', () => {
    const parentFamilyOf = (childId: string) =>
      Object.values(doc.families).filter((f) =>
        f.children.some((c) => c.childId === childId),
      )
    // 家宣(甲府家)・吉宗(紀州家)・家斉(一橋家)・家茂(紀州家)・慶喜(水戸家)
    for (const id of [
      'ienobu',
      'yoshimune',
      'ienari',
      'iemochi',
      'yoshinobu',
    ]) {
      expect(parentFamilyOf(id).length, `${id} の親家族`).toBeGreaterThan(0)
    }
  })

  it('実父と養父の双方が記録されている人物がいる(家宣・綱條・家茂)', () => {
    const pedigreesOf = (childId: string) =>
      Object.values(doc.families)
        .flatMap((f) => f.children)
        .filter((c) => c.childId === childId)
        .map((c) => c.pedigree)

    for (const id of ['ienobu', 'tsunaeda', 'iemochi']) {
      const pedigrees = pedigreesOf(id)
      expect(pedigrees, `${id} の続柄`).toContain('biological')
      expect(pedigrees, `${id} の続柄`).toContain('adopted')
    }
  })

  it('養子の子リンクが3件以上ある', () => {
    const adopted = Object.values(doc.families)
      .flatMap((f) => f.children)
      .filter((c) => c.pedigree === 'adopted')
    expect(adopted.length).toBeGreaterThanOrEqual(3)
  })
})

describe('徳川将軍15代サンプル: 旧暦を含む日付(spec「旧暦を含む日付の収録方針」)', () => {
  it('全員の生没日に和暦の原文が保持されている', () => {
    for (const p of Object.values(doc.persons)) {
      for (const event of [p.birth, p.death]) {
        if (!event?.date) continue
        expect(
          event.date.original.length,
          `${p.id} の日付原文`,
        ).toBeGreaterThan(0)
        expect(event.date.original).toMatch(/年|元年/)
      }
    }
  })

  /*
   * 旧暦の日付は「和暦の年月日をそのままの数字で写した名目値」で持つ(design D3)。
   * グレゴリオ暦の換算年を入れると、旧暦12月の日付は換算で翌年に落ちるため和暦表示が
   * 1年ずれる。この取り違えが起きやすい年またぎの6件を明示的に固定する。
   */
  const YEAR_CROSSING_DATES = [
    ['ieyasu', 'birth', '天文11年12月26日', { year: 1542, month: 12, day: 26 }],
    [
      'mitsusada',
      'birth',
      '寛永3年12月11日',
      { year: 1626, month: 12, day: 11 },
    ],
    [
      'ieshige',
      'birth',
      '正徳元年12月21日',
      { year: 1711, month: 12, day: 21 },
    ],
    [
      'tenshoin',
      'birth',
      '天保6年12月19日',
      { year: 1835, month: 12, day: 19 },
    ],
    [
      'mitsukuni',
      'death',
      '元禄13年12月6日',
      { year: 1700, month: 12, day: 6 },
    ],
    [
      'munetada',
      'death',
      '明和元年12月22日',
      { year: 1764, month: 12, day: 22 },
    ],
  ] as const

  it.each(YEAR_CROSSING_DATES)(
    '年をまたぐ旧暦の日付が和暦表示で原文どおりに戻る: %s の%s',
    (id, kind, original, expected) => {
      const fuzzy = person(id)[kind]?.date
      expect(fuzzy?.original).toBe(original)
      expect(fuzzy?.date).toEqual(expected)
      expect(formatDateForDisplay(fuzzy?.date, 'full', 'wareki')).toBe(original)
    },
  )

  it('閏月は原文のみに保持し、構造化日付は同じ番号の月へ畳んでいる', () => {
    const leap = Object.values(doc.persons).flatMap((p) =>
      [p.birth?.date, p.death?.date].filter((d) => d?.original.includes('閏')),
    )
    expect(leap.length, '閏月を含む原文').toBeGreaterThan(0)
    for (const fuzzy of leap) {
      const month = /閏(\d{1,2})月/.exec(fuzzy?.original ?? '')?.[1]
      expect(fuzzy?.date?.month).toBe(Number(month))
    }
  })

  it('改暦以後の日付は実際のグレゴリオ暦の年月日である(慶喜の没・天璋院の没)', () => {
    expect(person('yoshinobu').death?.date?.date).toEqual({
      year: 1913,
      month: 11,
      day: 22,
    })
    expect(person('tenshoin').death?.date?.date).toEqual({
      year: 1883,
      month: 11,
      day: 20,
    })
  })

  it('天文から大正まで元号の幅がある', () => {
    const originals = Object.values(doc.persons).flatMap((p) =>
      [p.birth?.date?.original, p.death?.date?.original].filter(
        (o): o is string => o !== undefined,
      ),
    )
    for (const era of ['天文', '慶長', '元禄', '享保', '天保', '大正']) {
      expect(
        originals.some((o) => o.startsWith(era)),
        `元号 ${era}`,
      ).toBe(true)
    }
  })

  it('生年が没年より後になっている人物がいない', () => {
    for (const p of Object.values(doc.persons)) {
      const birth = p.birth?.date?.date?.year
      const death = p.death?.date?.date?.year
      if (birth === undefined || death === undefined) continue
      expect(birth, `${p.id} の生没年`).toBeLessThanOrEqual(death)
    }
  })
})

describe('徳川将軍15代サンプル: レイアウト', () => {
  it('つながった全体表示のレイアウト不変条件を満たす', () => {
    expectLayoutInvariants(layoutPedigree(doc), doc)
  })
})

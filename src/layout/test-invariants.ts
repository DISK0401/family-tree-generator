import { expect } from 'vitest'
import type { TreeDocument } from '../domain/types'
import { CARD_SIZE } from './coordinates'
import type { LinkPoint, PedigreeLayout } from './types'

/**
 * レイアウト結果が常に満たすべき不変条件のテスト用ヘルパ。
 * 観点ごとの個別テストとは別に、主要なfixtureへ横断的に適用する
 * (「観点ごとのテストはあるが、どのfixtureにも共通で効く網が無い」という監査指摘への対応)。
 * 実装の詳細(点の数・レーンの高さ等)には触れず、spec のMUSTと
 * 「線や結合点が他人のカードへ入り込まない」という読み取りやすさの下限だけを見る
 */

/** 検査対象。`PedigreeLayout`と、成分単位の`CoordinateResult`(coordinates.ts)の両方を受けられる形 */
type LayoutLike = Pick<
  PedigreeLayout,
  'persons' | 'families' | 'links' | 'width' | 'height'
>

interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

function cardRectsOf(layout: LayoutLike): Map<string, Rect> {
  return new Map(
    layout.persons.map((p) => [
      p.personId,
      {
        left: p.x,
        top: p.y,
        right: p.x + CARD_SIZE.width,
        bottom: p.y + CARD_SIZE.height,
      },
    ]),
  )
}

/**
 * 軸平行の線分がカード矩形の**内部**(境界を除く)と交わるかどうか。
 * 子カードの上端で線を受ける・カードの縁すれすれを通る、といった「接触」は交差に数えない。
 * レイアウタの経路は水平・垂直のみという前提を置き、斜めの線分が現れたらテストを失敗させる
 */
function segmentIntersectsRect(
  p1: LinkPoint,
  p2: LinkPoint,
  rect: Rect,
): boolean {
  if (p1.x === p2.x) {
    const yMin = Math.min(p1.y, p2.y)
    const yMax = Math.max(p1.y, p2.y)
    return (
      p1.x > rect.left &&
      p1.x < rect.right &&
      yMax > rect.top &&
      yMin < rect.bottom
    )
  }
  if (p1.y === p2.y) {
    const xMin = Math.min(p1.x, p2.x)
    const xMax = Math.max(p1.x, p2.x)
    return (
      p1.y > rect.top &&
      p1.y < rect.bottom &&
      xMax > rect.left &&
      xMin < rect.right
    )
  }
  throw new Error(
    `斜めの線分は想定していない: (${p1.x},${p1.y})-(${p2.x},${p2.y})`,
  )
}

/** spec「同一人物を複製しない配置」: 1人の人物に位置は1つだけ */
export function expectNoDuplicatePersons(layout: LayoutLike): void {
  const ids = layout.persons.map((p) => p.personId)
  expect(new Set(ids).size, '同一人物が複数の位置へ複製されている').toBe(
    ids.length,
  )
}

/** すべての系線の点と結合点が図の寸法(0〜width / 0〜height)に収まる */
export function expectPointsWithinBounds(layout: LayoutLike): void {
  const within = (x: number, y: number, label: string): void => {
    expect(x, `${label} のxが図の範囲外`).toBeGreaterThanOrEqual(0)
    expect(x, `${label} のxが図の範囲外`).toBeLessThanOrEqual(layout.width)
    expect(y, `${label} のyが図の範囲外`).toBeGreaterThanOrEqual(0)
    expect(y, `${label} のyが図の範囲外`).toBeLessThanOrEqual(layout.height)
  }
  for (const link of layout.links) {
    const label =
      link.kind === 'marriage'
        ? `婚姻線 ${link.familyId}`
        : `親子線 ${link.familyId}→${link.childId}`
    for (const point of link.points) within(point.x, point.y, label)
  }
  for (const family of layout.families)
    within(family.x, family.y, `結合点 ${family.familyId}`)
}

/**
 * 系線のどの線分も、その線が正当に接続する人物**以外**のカードを貫通しない。
 * 正当な接続先は、婚姻線ならその配偶者たち(カード中心から出る)、親子線ならその家族の
 * 配偶者たち(ひとり親の中心から出る線など)と子本人。それ以外のカードに線が入り込むと、
 * 無関係な人物がその家族の一員であるかのように読めてしまう
 */
export function expectLinksAvoidForeignCards(
  layout: LayoutLike,
  doc: TreeDocument,
): void {
  const rects = cardRectsOf(layout)
  for (const link of layout.links) {
    const allowed = new Set<string>()
    if (link.kind === 'marriage') {
      for (const id of link.spouseIds) allowed.add(id)
    } else {
      allowed.add(link.childId)
      for (const id of doc.families[link.familyId]?.spouseIds ?? [])
        allowed.add(id)
    }
    const label =
      link.kind === 'marriage'
        ? `婚姻線 ${link.familyId}`
        : `親子線 ${link.familyId}→${link.childId}`
    for (let i = 0; i + 1 < link.points.length; i++) {
      for (const [personId, rect] of rects) {
        if (allowed.has(personId)) continue
        expect(
          segmentIntersectsRect(link.points[i], link.points[i + 1], rect),
          `${label} の線分${i}が ${personId} のカードを貫通している`,
        ).toBe(false)
      }
    }
  }
}

/**
 * 結合点(FamilyPosition)が、その家族の配偶者以外のカードの内部に落ちない。
 * 結合点が他人のカードに重なると、その人物から子への系線が出ているように見える
 * (重婚の監査指摘: 結合点が間に挟まった配偶者のカード中心に一致していた)
 */
export function expectFamiliesOutsideForeignCards(
  layout: LayoutLike,
  doc: TreeDocument,
): void {
  const rects = cardRectsOf(layout)
  for (const family of layout.families) {
    const allowed = new Set(doc.families[family.familyId]?.spouseIds ?? [])
    for (const [personId, rect] of rects) {
      if (allowed.has(personId)) continue
      const inside =
        family.x > rect.left &&
        family.x < rect.right &&
        family.y > rect.top &&
        family.y < rect.bottom
      expect(
        inside,
        `結合点 ${family.familyId} が ${personId} のカードの内部にある`,
      ).toBe(false)
    }
  }
}

/** 上記すべての不変条件をまとめて検査する */
export function expectLayoutInvariants(
  layout: LayoutLike,
  doc: TreeDocument,
): void {
  expectNoDuplicatePersons(layout)
  expectPointsWithinBounds(layout)
  expectLinksAvoidForeignCards(layout, doc)
  expectFamiliesOutsideForeignCards(layout, doc)
}

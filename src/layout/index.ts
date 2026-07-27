import type { TreeDocument } from '../domain/types'
import { assignCoordinates, CARD_SIZE } from './coordinates'
import { assignGenerations } from './generations'
import { buildGraph, splitIntoComponents } from './graph'
import { orderWithinLayers } from './ordering'
import type { FamilyPosition, LinkPoint, PedigreeLayout, PedigreeLink, PersonPosition } from './types'

export type {
  CardSize,
  FamilyPosition,
  LinkPoint,
  MarriageLink,
  ParentChildLink,
  PedigreeLayout,
  PedigreeLink,
  PersonPosition,
} from './types'

/** 互いに関係を持たない連結成分どうしの間隔(design.md D2-3) */
const COMPONENT_GAP = 96

function shiftLink(link: PedigreeLink, dx: number): PedigreeLink {
  const points = link.points.map((p): LinkPoint => ({ x: p.x + dx, y: p.y }))
  return { ...link, points }
}

/**
 * `TreeDocument`から座標付きの系図を求める、レイアウタの公開エントリポイント(design.md D2)。
 *
 * 家族(結合点)グラフの構築(graph.ts)→連結成分ごとの分割(spec「連結していない範囲の配置」)
 * →各成分での世代割り当て(generations.ts)・層内順序(ordering.ts)・座標割り当て(coordinates.ts)
 * →成分を横に並べて結合、の順に行う純粋関数。
 *
 * 成分ごとに独立してレイアウトしてから結合するのは、無関係な人物・家族クラスタの追加や変更が、
 * 既存の連結成分の座標に影響しないようにするため(spec「レイアウトの決定性」の
 * 「無関係な編集で配置が跳ねない」)。成分の並び順は`splitIntoComponents`が返す順(各成分内の
 * 最小人物IDの昇順)に固定する
 */
export function layoutPedigree(doc: TreeDocument): PedigreeLayout {
  const graph = buildGraph(doc)
  const components = splitIntoComponents(graph)

  const persons: PersonPosition[] = []
  const families: FamilyPosition[] = []
  const links: PedigreeLink[] = []
  let xOffset = 0
  let height = 0

  for (const component of components) {
    const { generationOf } = assignGenerations(component)
    const layerOrder = orderWithinLayers(component, generationOf)
    const piece = assignCoordinates(component, generationOf, layerOrder)

    for (const p of piece.persons) persons.push({ ...p, x: p.x + xOffset })
    for (const f of piece.families) families.push({ ...f, x: f.x + xOffset })
    for (const link of piece.links) links.push(shiftLink(link, xOffset))

    height = Math.max(height, piece.height)
    xOffset += piece.width + COMPONENT_GAP
  }

  const width = persons.length > 0 ? Math.max(0, xOffset - COMPONENT_GAP) : 0

  return { persons, families, links, cardSize: CARD_SIZE, width, height }
}

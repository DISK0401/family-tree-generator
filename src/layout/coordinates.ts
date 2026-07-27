import type { FamilyId, PersonId } from '../domain/types'
import type { PedigreeGraph } from './graph'
import type { LayerOrder } from './ordering'
import type { CardSize, FamilyPosition, LinkPoint, PedigreeLink, PersonPosition } from './types'

/**
 * カードの寸法と層間隔(design.md D2-3)。
 * 実際の見た目は`PersonCardView`(6群)を描く側の裁量だが、レイアウタは重なり判定・
 * 層の高さ計算のために具体的な値を1つ持つ必要があるため、既存カードの縦書き2列組みが
 * おおむね収まる寸法をここで定める。
 *
 * 1〜5群では暫定値(120×160)だったが、7群で実カードの寸法
 * (`FamilyTreeCanvas.tsx`の`CARD_WIDTH`/`CARD_HEIGHT` = 104×116)と突き合わせて確定させた。
 * `src/layout`は`src/rendering`に依存できない(`src/layout/types.test.ts`が機械的に検査する)ため、
 * 依存の向きを守れる`src/layout`側にこの共通定数を置き、rendering側がここから読む形にする
 * (rendering → layout の一方向)
 */
export const CARD_SIZE: CardSize = { width: 104, height: 116 }
export const HORIZONTAL_GAP = 24
export const VERTICAL_GAP = 96

/**
 * x座標の緩和の往復回数(design.md D2-3「親の union をその子たちの中央へ寄せる調整を数回行う」)。
 * 上から下へ(親の位置に子を寄せる)と下から上へ(子の位置に親を寄せる)を交互に行う
 */
const RELAXATION_DIRECTIONS: Array<'down' | 'up'> = ['down', 'up', 'down', 'up']

function rowTop(generation: number): number {
  return generation * (CARD_SIZE.height + VERTICAL_GAP)
}

export interface CoordinateResult {
  persons: PersonPosition[]
  families: FamilyPosition[]
  links: PedigreeLink[]
  width: number
  height: number
}

/**
 * 層内で必ず隣接させる塊(design.md D2-2「夫婦は必ず隣接させ、1つの並び替え単位として扱う」)。
 * `ordering.ts`が決めた並び順の中で、配偶者どうしが隣り合っている箇所をそのまま塊として扱う
 */
interface Block {
  personIds: PersonId[]
  width: number
}

function blockWidth(count: number): number {
  return count * CARD_SIZE.width + (count - 1) * HORIZONTAL_GAP
}

function spousePairKey(a: PersonId, b: PersonId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

function buildSpousePairs(graph: PedigreeGraph): Set<string> {
  const pairs = new Set<string>()
  for (const familyId of [...graph.families.keys()].sort()) {
    const spouseIds = graph.families.get(familyId)?.spouseIds ?? []
    for (let i = 0; i < spouseIds.length; i++) {
      for (let j = i + 1; j < spouseIds.length; j++) {
        pairs.add(spousePairKey(spouseIds[i], spouseIds[j]))
      }
    }
  }
  return pairs
}

/**
 * 層の並び順を塊へ畳む。隣り合う2人が配偶者であれば1つの塊にする。
 * 塊の最大人数を2に抑えるのは、ドメイン上1つの家族の配偶者が最大2人であるため
 * (3人以上が連なるのは重婚で別々の家族に属する場合であり、そこは塊にしない)
 */
function buildBlocks(ids: PersonId[], spousePairs: Set<string>): Block[] {
  const blocks: Block[] = []
  for (const id of ids) {
    const last = blocks[blocks.length - 1]
    if (last && last.personIds.length < 2 && spousePairs.has(spousePairKey(last.personIds[0], id))) {
      last.personIds.push(id)
      last.width = blockWidth(last.personIds.length)
      continue
    }
    blocks.push({ personIds: [id], width: blockWidth(1) })
  }
  return blocks
}

/**
 * 単調非減少の制約下での最小二乗当てはめ(Pool Adjacent Violators)。
 * 「並び順は変えず、最小間隔は必ず空け、そのうえで希望位置へ最も近づける」という配置問題は
 * この形へ帰着でき、O(n)で厳密解が求まる。左から順に押し出すだけの素朴な方法と違い、
 * 詰まった箇所の影響が片側へ一方的に溜まらない
 */
function isotonicFit(values: number[]): number[] {
  const levels: number[] = []
  const counts: number[] = []
  for (const value of values) {
    let level = value
    let count = 1
    while (levels.length > 0 && levels[levels.length - 1] > level) {
      const previousLevel = levels.pop() as number
      const previousCount = counts.pop() as number
      level = (level * count + previousLevel * previousCount) / (count + previousCount)
      count += previousCount
    }
    levels.push(level)
    counts.push(count)
  }

  const result: number[] = []
  for (let i = 0; i < levels.length; i++) {
    for (let j = 0; j < counts[i]; j++) result.push(levels[i])
  }
  return result
}

/**
 * 層内の塊を、並び順と最小間隔を保ったまま希望位置(重心)へ最も近い位置へ配置する。
 * 希望位置が無い塊(親も子も配置されていない)は現在位置を希望位置として扱い、動かさない
 */
function placeLayer(blocks: Block[], targetCenters: Array<number | undefined>, currentCenters: number[]): number[] {
  if (blocks.length === 0) return []

  const requiredGap: number[] = []
  for (let i = 0; i < blocks.length - 1; i++) {
    requiredGap.push((blocks[i].width + blocks[i + 1].width) / 2 + HORIZONTAL_GAP)
  }
  const prefix: number[] = [0]
  for (let i = 0; i < requiredGap.length; i++) prefix.push(prefix[i] + requiredGap[i])

  const shifted = blocks.map((_, i) => (targetCenters[i] ?? currentCenters[i]) - prefix[i])
  const fitted = isotonicFit(shifted)
  return blocks.map((block, i) => fitted[i] + prefix[i] - block.width / 2)
}

/** 塊の左端から、構成する人物それぞれのx座標(カード左上)を求める */
function personXsOfBlock(block: Block, left: number): Array<{ personId: PersonId; x: number }> {
  return block.personIds.map((personId, index) => ({
    personId,
    x: left + index * (CARD_SIZE.width + HORIZONTAL_GAP),
  }))
}

/**
 * 層内の並び順(ordering.ts)から座標を割り当てる(design.md D2-3, tasks.md 4群)。
 *
 * まず層ごとに一定間隔(カード幅+HORIZONTAL_GAP)で詰め(4.1)、続いて上下方向へ往復しながら
 * 「親の位置へ子を寄せる/子の位置へ親を寄せる」緩和を数回行う(4.2)。並び順と最小間隔は
 * 緩和の全過程で保たれるため、カードが重なることはない。
 *
 * 家族(結合点)のx座標は子たちの中央に置くが、配偶者たちの中央の範囲へ必ず収める。
 * 結合点は婚姻線の上に乗っていなければ「配偶者どうしがそこで結ばれ、子がそこから系線を受ける」
 * という結合点の役割(spec「家族を結合点とするレイアウト」)を果たせず、親子線が宙に浮くため
 */
export function assignCoordinates(
  graph: PedigreeGraph,
  generationOf: Map<PersonId, number>,
  layerOrder: LayerOrder,
): CoordinateResult {
  const spousePairs = buildSpousePairs(graph)
  const generations = [...layerOrder.keys()].sort((a, b) => a - b)

  const blocksOf = new Map<number, Block[]>()
  const leftsOf = new Map<number, number[]>()
  for (const generation of generations) {
    const blocks = buildBlocks(layerOrder.get(generation) ?? [], spousePairs)
    blocksOf.set(generation, blocks)
    const lefts: number[] = []
    let cursor = 0
    for (const block of blocks) {
      lefts.push(cursor)
      cursor += block.width + HORIZONTAL_GAP
    }
    leftsOf.set(generation, lefts)
  }

  const centerXOf = new Map<PersonId, number>()
  const refreshCenters = (): void => {
    centerXOf.clear()
    for (const generation of generations) {
      const blocks = blocksOf.get(generation) ?? []
      const lefts = leftsOf.get(generation) ?? []
      blocks.forEach((block, index) => {
        for (const { personId, x } of personXsOfBlock(block, lefts[index])) {
          centerXOf.set(personId, x + CARD_SIZE.width / 2)
        }
      })
    }
  }
  refreshCenters()

  for (const direction of RELAXATION_DIRECTIONS) {
    const sequence = direction === 'down' ? generations : [...generations].reverse()
    for (const generation of sequence) {
      const blocks = blocksOf.get(generation) ?? []
      const lefts = leftsOf.get(generation) ?? []
      const currentCenters = blocks.map((block, index) => lefts[index] + block.width / 2)
      const targets = blocks.map((block) => desiredCenter(block, graph, centerXOf, direction))
      leftsOf.set(generation, placeLayer(blocks, targets, currentCenters))
      refreshCenters()
    }
  }

  const persons: PersonPosition[] = []
  for (const generation of generations) {
    const blocks = blocksOf.get(generation) ?? []
    const lefts = leftsOf.get(generation) ?? []
    blocks.forEach((block, index) => {
      for (const { personId, x } of personXsOfBlock(block, lefts[index])) {
        persons.push({ personId, generation, x, y: rowTop(generation) })
      }
    })
  }

  // 成分の左端を原点へ揃える(緩和の結果として負のx座標が出るため)
  const minX = persons.length > 0 ? Math.min(...persons.map((p) => p.x)) : 0
  for (const position of persons) position.x -= minX
  centerXOf.clear()
  for (const position of persons) centerXOf.set(position.personId, position.x + CARD_SIZE.width / 2)

  const families: FamilyPosition[] = []
  const familyCenterX = new Map<string, number>()
  const familyGeneration = new Map<string, number>()

  for (const familyId of [...graph.families.keys()].sort()) {
    const family = graph.families.get(familyId)
    if (!family) continue
    const spouseCenters = family.spouseIds
      .map((id) => centerXOf.get(id))
      .filter((x): x is number => x !== undefined)
    const childCenters = family.children
      .map((c) => centerXOf.get(c.childId))
      .filter((x): x is number => x !== undefined)
    if (spouseCenters.length === 0 && childCenters.length === 0) continue // どちらの端も配置されていない(頑健性)

    // 結合点の世代は配偶者の世代(通常は揃っている)。配偶者が配置されていない場合のみ、
    // 子の世代-1で近似する(ひとり親の親が欠損参照だった場合等の保険)
    const generation =
      spouseCenters.length > 0
        ? Math.min(...family.spouseIds.map((id) => generationOf.get(id) ?? 0))
        : Math.min(...family.children.map((c) => (generationOf.get(c.childId) ?? 1) - 1))

    const preferred =
      childCenters.length > 0
        ? childCenters.reduce((sum, x) => sum + x, 0) / childCenters.length
        : spouseCenters.reduce((sum, x) => sum + x, 0) / spouseCenters.length
    const centerX = clampToUnionRange(preferred, spouseCenters)

    const y = rowTop(generation) + CARD_SIZE.height / 2
    families.push({ familyId, generation, x: centerX, y })
    familyCenterX.set(familyId, centerX)
    familyGeneration.set(familyId, generation)
  }

  const links = buildLinks(graph, generationOf, centerXOf, familyCenterX, familyGeneration)

  const width = persons.length > 0 ? Math.max(...persons.map((p) => p.x + CARD_SIZE.width)) : 0
  const height = persons.length > 0 ? Math.max(...persons.map((p) => p.y + CARD_SIZE.height)) : 0

  return { persons, families, links, width, height }
}

/**
 * 結合点を置ける範囲へ収める。
 *
 * 配偶者が2人以上いる家族では、**カードとカードのあいだ**に収める。配偶者の中心どうしの範囲へ
 * 収めるだけだと、子たちの中央が範囲の外にあるときに結合点が端の配偶者の中心へ寄り切り、
 * 子への系線が「婚姻線の真ん中」ではなく「その人物のカード」から直接出ているように見える。
 * 配偶者が1人の家族には婚姻線が無いため、その人物の中心をそのまま使う
 */
function clampToUnionRange(preferred: number, spouseCenters: number[]): number {
  if (spouseCenters.length === 0) return preferred
  if (spouseCenters.length === 1) return spouseCenters[0]

  const low = Math.min(...spouseCenters) + CARD_SIZE.width / 2
  const high = Math.max(...spouseCenters) - CARD_SIZE.width / 2
  // カードが隣接していない(重婚などで間に別の人物がいる)場合を除き、範囲は隙間ぶんの幅になる
  if (low > high) return (Math.min(...spouseCenters) + Math.max(...spouseCenters)) / 2
  return Math.min(Math.max(preferred, low), high)
}

/**
 * 緩和で塊を寄せる先(重心)を求める。
 * 下向きのパスでは親家族の配偶者たちの中央、上向きのパスでは自分たちの子たちの中央。
 * 塊を構成する全員ぶんを平均するため、婚入した配偶者(実家が未記録)は相手の実家へ引かれる
 */
function desiredCenter(
  block: Block,
  graph: PedigreeGraph,
  centerXOf: Map<PersonId, number>,
  direction: 'down' | 'up',
): number | undefined {
  const values: number[] = []
  for (const personId of block.personIds) {
    const node = graph.persons.get(personId)
    if (!node) continue
    const familyIds = direction === 'down' ? node.parentFamilyIds : node.spouseFamilyIds
    for (const familyId of [...familyIds].sort()) {
      const family = graph.families.get(familyId)
      if (!family) continue
      const relatedIds =
        direction === 'down' ? family.spouseIds : family.children.map((c) => c.childId)
      for (const relatedId of relatedIds) {
        if (block.personIds.includes(relatedId)) continue // 塊の内側は基準にしない
        const center = centerXOf.get(relatedId)
        if (center !== undefined) values.push(center)
      }
    }
  }
  if (values.length === 0) return undefined
  return values.reduce((sum, x) => sum + x, 0) / values.length
}

/** 1本の親子線の束(1つの家族が、ある層にいる子たちへ引く線)が横に走る区間 */
export interface LinkBusInterval {
  /** 束を識別するキー。同じ家族でも子の層が違えば別の束になる */
  key: string
  left: number
  right: number
}

/**
 * 親子線が横に走る高さ(レーン)を、束ごとに決める。
 *
 * 親子線は「結合点から下へ→横へ→子の真上から下へ」というエルボー経路を取るが、
 * その横に走る区間をどの家族も同じ高さに置くと、無関係な家族の線どうしが一直線に
 * つながって見え、図が読めなくなる(実データで、8家族ぶんの横線が1本の長い棒に
 * 見える状態が起きた)。
 *
 * そこで層と層の隙間(VERTICAL_GAP)を複数のレーンに分け、横方向に重なる束には
 * 必ず別のレーンを割り当てる。重なりのない束どうしは同じレーンを使い回すため、
 * レーン数は「同時に重なっている束の最大数」で済み、隙間が細切れになりにくい。
 * 割り当ては区間の左端→キーの順に貪欲に行い、結果を決定的にする(D5)。
 */
export function assignLinkLanes(
  bands: Map<number, LinkBusInterval[]>,
): Map<string, { lane: number; laneCount: number }> {
  const result = new Map<string, { lane: number; laneCount: number }>()

  for (const generation of [...bands.keys()].sort((a, b) => a - b)) {
    const intervals = [...(bands.get(generation) ?? [])].sort(
      (a, b) => a.left - b.left || a.key.localeCompare(b.key),
    )
    // 各レーンで最後に使った右端。次の区間の左端がそれより十分右にあれば同じレーンを再利用する
    const laneRight: number[] = []
    const laneOf = new Map<string, number>()

    for (const interval of intervals) {
      let lane = laneRight.findIndex((right) => interval.left > right + HORIZONTAL_GAP)
      if (lane === -1) {
        lane = laneRight.length
        laneRight.push(interval.right)
      } else {
        laneRight[lane] = Math.max(laneRight[lane], interval.right)
      }
      laneOf.set(interval.key, lane)
    }

    for (const [key, lane] of laneOf) {
      result.set(key, { lane, laneCount: Math.max(laneRight.length, 1) })
    }
  }

  return result
}

/** 束のキー。家族と「子がいる層」の組で1本の束になる */
function busKey(familyId: FamilyId, childGeneration: number): string {
  return `${familyId}|${childGeneration}`
}

/**
 * 系線の経路を求める(4.3, 4.4)。婚姻線は配偶者どうしを結ぶ横線、親子線は結合点から子への
 * 「エルボー」経路(結合点から下へ→層の隙間のレーンで横へ→子の真上から下へ)とする。
 * 横に走る高さは`assignLinkLanes`が家族ごとに決めるため、無関係な家族の線がつながって
 * 見えることはなく、カードの並ぶ高さを横切ることもない。
 *
 * 続柄(pedigree)は親子の組ごとに、渡された`family.children`からそのまま引き継ぐため、
 * 同一人物が複数の親家族を持つ場合も、家族ごとに正しい続柄の系線が別々に得られる
 * (spec「系線の種別と続柄の保持」「実親と養親の双方を持つ人物」)。
 */
function buildLinks(
  graph: PedigreeGraph,
  generationOf: Map<PersonId, number>,
  centerXOf: Map<PersonId, number>,
  familyCenterX: Map<string, number>,
  familyGeneration: Map<string, number>,
): PedigreeLink[] {
  const links: PedigreeLink[] = []

  // 束(家族 × 子のいる層)ごとに、横に走る区間を「子のいる層のすぐ上の隙間」へ集める。
  //
  // 束を親のすぐ下の隙間へ置くと、層をまたぐ親子(婚入して数世代下へ移った人物など)の
  // 横線が、上の層の混み合った隙間を端から端まで横断してしまう。子のすぐ上に置けば、
  // どの横線も「その線がつなぐ子たちの真上」にあり、長い移動は縦線が受け持つ。
  // 同じ家族でも子の層が違えば別の束になるため、一部の子だけが下の層にいる家族は
  // 「近くの子への短い束」と「遠くの子への束」に分かれる
  const bands = new Map<number, LinkBusInterval[]>()
  for (const familyId of [...graph.families.keys()].sort()) {
    const family = graph.families.get(familyId)
    const unionX = familyCenterX.get(familyId)
    const unionGeneration = familyGeneration.get(familyId)
    if (!family || unionX === undefined || unionGeneration === undefined) continue

    const xsByChildGeneration = new Map<number, number[]>()
    for (const child of family.children) {
      const x = centerXOf.get(child.childId)
      const childGeneration = generationOf.get(child.childId)
      if (x === undefined || childGeneration === undefined) continue
      xsByChildGeneration.set(childGeneration, [...(xsByChildGeneration.get(childGeneration) ?? []), x])
    }

    for (const [childGeneration, xs] of [...xsByChildGeneration.entries()].sort((a, b) => a[0] - b[0])) {
      const band = childGeneration - 1
      const list = bands.get(band) ?? []
      list.push({
        key: busKey(familyId, childGeneration),
        left: Math.min(unionX, ...xs),
        right: Math.max(unionX, ...xs),
      })
      bands.set(band, list)
    }
  }
  const lanes = assignLinkLanes(bands)

  for (const familyId of [...graph.families.keys()].sort()) {
    const family = graph.families.get(familyId)
    const unionX = familyCenterX.get(familyId)
    const unionGeneration = familyGeneration.get(familyId)
    if (!family || unionX === undefined || unionGeneration === undefined) continue
    const unionY = rowTop(unionGeneration) + CARD_SIZE.height / 2

    if (family.spouseIds.length >= 2) {
      const spousePoints = family.spouseIds
        .map((id) => ({ id, x: centerXOf.get(id) }))
        .filter((p): p is { id: PersonId; x: number } => p.x !== undefined)
        .sort((a, b) => a.x - b.x)
      if (spousePoints.length >= 2) {
        links.push({
          kind: 'marriage',
          familyId,
          spouseIds: spousePoints.map((p) => p.id),
          points: spousePoints.map((p): LinkPoint => ({ x: p.x, y: unionY })),
        })
      }
    }

    const children = [...family.children].sort((a, b) => a.childId.localeCompare(b.childId))
    for (const child of children) {
      const childX = centerXOf.get(child.childId)
      const childGeneration = generationOf.get(child.childId)
      if (childX === undefined || childGeneration === undefined) continue

      // 横に走る高さは、子の層のすぐ上の隙間(VERTICAL_GAP)に収める。レーンをこの帯の
      // 内側で等間隔に配ることで、どの線もカードの並ぶ高さを横切らない
      const { lane, laneCount } = lanes.get(busKey(familyId, childGeneration)) ?? { lane: 0, laneCount: 1 }
      const bandTop = rowTop(childGeneration) - VERTICAL_GAP
      const laneY = bandTop + (VERTICAL_GAP * (lane + 1)) / (laneCount + 1)

      // 子のカードの上端で受ける(カード中心まで引くと、線がカードの上に重なって見える)
      const childY = rowTop(childGeneration)
      links.push({
        kind: 'parent-child',
        familyId,
        childId: child.childId,
        pedigree: child.pedigree,
        points: [
          { x: unionX, y: unionY },
          { x: unionX, y: laneY },
          { x: childX, y: laneY },
          { x: childX, y: childY },
        ],
      })
    }
  }

  return links
}

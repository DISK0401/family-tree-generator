import type { FamilyId, Pedigree, PersonId } from '../domain/types'
import type { PedigreeGraph } from './graph'
import type { LayerOrder } from './ordering'
import type {
  CardSize,
  FamilyPosition,
  LinkPoint,
  PedigreeLink,
  PersonPosition,
} from './types'

/**
 * カードの寸法と層間隔(design.md D2-3)。
 * 実際の見た目は`PersonCardView`(6群)を描く側の裁量だが、レイアウタは重なり判定・
 * 層の高さ計算のために具体的な値を1つ持つ必要があるため、既存カードの縦書き2列組みが
 * おおむね収まる寸法をここで定める。
 *
 * 1〜5群では暫定値(120×160)だったが、7群で実カードの寸法
 * (`FamilyTreeCanvas.tsx`の`CARD_WIDTH`/`CARD_HEIGHT`)と突き合わせて確定させた。
 * `src/layout`は`src/rendering`に依存できない(`src/layout/types.test.ts`が機械的に検査する)ため、
 * 依存の向きを守れる`src/layout`側にこの共通定数を置き、rendering側がここから読む形にする
 * (rendering → layout の一方向)
 *
 * 104×116から136×180へ拡大(`fix-tree-card-overlap-and-density` design.md D3)。
 * 全表示項目オン+氏名3文字(戸籍由来の伝統的な名の典型的な長さ)+出生地・没地
 * 両方入力+和暦表示という最も厳しい組み合わせで、実際にブラウザでレンダリングして
 * 名前列が年月日の行へはみ出さない(オーバーフローしない)ことを実測して決めた。
 * 幅は136px以上で生没年月日の折り返しが2行相当に収まるようになる閾値、
 * 高さはその上で氏名列(3文字)・ふりがな・生没年月日・生没地のすべてが
 * 重ならずに収まる最小高さに、視覚的な余白ぶんを加えた値
 */
export const CARD_SIZE: CardSize = { width: 136, height: 180 }
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
    if (
      last &&
      last.personIds.length < 2 &&
      spousePairs.has(spousePairKey(last.personIds[0], id))
    ) {
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
      level =
        (level * count + previousLevel * previousCount) /
        (count + previousCount)
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
function placeLayer(
  blocks: Block[],
  targetCenters: Array<number | undefined>,
  currentCenters: number[],
): number[] {
  if (blocks.length === 0) return []

  const requiredGap: number[] = []
  for (let i = 0; i < blocks.length - 1; i++) {
    requiredGap.push(
      (blocks[i].width + blocks[i + 1].width) / 2 + HORIZONTAL_GAP,
    )
  }
  const prefix: number[] = [0]
  for (let i = 0; i < requiredGap.length; i++)
    prefix.push(prefix[i] + requiredGap[i])

  const shifted = blocks.map(
    (_, i) => (targetCenters[i] ?? currentCenters[i]) - prefix[i],
  )
  const fitted = isotonicFit(shifted)
  return blocks.map((block, i) => fitted[i] + prefix[i] - block.width / 2)
}

/** 塊の左端から、構成する人物それぞれのx座標(カード左上)を求める */
function personXsOfBlock(
  block: Block,
  left: number,
): Array<{ personId: PersonId; x: number }> {
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
    const sequence =
      direction === 'down' ? generations : [...generations].reverse()
    for (const generation of sequence) {
      const blocks = blocksOf.get(generation) ?? []
      const lefts = leftsOf.get(generation) ?? []
      const currentCenters = blocks.map(
        (block, index) => lefts[index] + block.width / 2,
      )
      const targets = blocks.map((block) =>
        desiredCenter(block, graph, generationOf, centerXOf, direction),
      )
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

  const { families, links } = buildLinksAndFamilies(
    graph,
    generationOf,
    centerXOf,
    persons,
  )

  return normalizeToOrigin(persons, families, links)
}

/**
 * 全点(カード・結合点・系線)の左上を原点へ平行移動し、全体の寸法を求める。
 *
 * x座標の緩和は負のxを残すし、配偶者が1人も配置されていない家族の結合点(最上層の子の
 * さらに上のレーン帯)や、行の外側へスナップされた縦線は、カードの範囲の外(負の座標を含む)へ
 * 出ることがある。カードだけを基準に寸法を測ると、これらの点が 0〜width / 0〜height に収まる
 * 保証がなくなるため、families と links の全点まで含めて最小値・最大値を取ってから移動する。
 * `Math.min(...配列)`のスプレッドは要素数ぶんの引数を積むため、人数が増えると引数上限に触れる。
 * ループで畳み込む
 */
function normalizeToOrigin(
  persons: PersonPosition[],
  families: FamilyPosition[],
  links: PedigreeLink[],
): CoordinateResult {
  if (persons.length === 0)
    return { persons, families, links, width: 0, height: 0 }

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  const expand = (x: number, y: number): void => {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  for (const p of persons) {
    expand(p.x, p.y)
    expand(p.x + CARD_SIZE.width, p.y + CARD_SIZE.height)
  }
  for (const f of families) expand(f.x, f.y)
  for (const link of links) {
    for (const point of link.points) expand(point.x, point.y)
  }

  for (const p of persons) {
    p.x -= minX
    p.y -= minY
  }
  for (const f of families) {
    f.x -= minX
    f.y -= minY
  }
  for (const link of links) {
    for (const point of link.points) {
      point.x -= minX
      point.y -= minY
    }
  }

  return { persons, families, links, width: maxX - minX, height: maxY - minY }
}

/**
 * 緩和で塊を寄せる先(重心)を求める。
 * 下向きのパスでは親家族の配偶者たちの中央、上向きのパスでは自分たちの子たちの中央。
 * 塊を構成する全員ぶんを平均するため、婚入した配偶者(実家が未記録)は相手の実家へ引かれる。
 *
 * **層が離れた相手ほど弱く引く**(重みは層の隔たりの逆数)。婚入して数世代下へ移った子は
 * 図の反対側に置かれることがあり、そこへ等しく引かれると、実家とその近い世代の子たちまで
 * まとめて引きずられて他家の真上へ入り込んでしまう。遠い相手との系線はどのみち長くなるので、
 * 隣の世代との位置関係を優先し、遠い相手の影響は弱めるほうが図全体として読みやすくなる
 */
function desiredCenter(
  block: Block,
  graph: PedigreeGraph,
  generationOf: Map<PersonId, number>,
  centerXOf: Map<PersonId, number>,
  direction: 'down' | 'up',
): number | undefined {
  const blockGeneration = Math.min(
    ...block.personIds.map((id) => generationOf.get(id) ?? 0),
  )
  let weightedSum = 0
  let weightTotal = 0

  for (const personId of block.personIds) {
    const node = graph.persons.get(personId)
    if (!node) continue
    const familyIds =
      direction === 'down' ? node.parentFamilyIds : node.spouseFamilyIds
    for (const familyId of [...familyIds].sort()) {
      const family = graph.families.get(familyId)
      if (!family) continue
      const relatedIds =
        direction === 'down'
          ? family.spouseIds
          : family.children.map((c) => c.childId)
      for (const relatedId of relatedIds) {
        if (block.personIds.includes(relatedId)) continue // 塊の内側は基準にしない
        const center = centerXOf.get(relatedId)
        if (center === undefined) continue
        const distance = Math.max(
          Math.abs((generationOf.get(relatedId) ?? 0) - blockGeneration),
          1,
        )
        const weight = 1 / distance
        weightedSum += center * weight
        weightTotal += weight
      }
    }
  }
  if (weightTotal === 0) return undefined
  return weightedSum / weightTotal
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
      let lane = laneRight.findIndex(
        (right) => interval.left > right + HORIZONTAL_GAP,
      )
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

/** 結合点がレーン上にある家族(エルボー婚姻・配偶者ゼロ)の、レーン上の横区間のキー */
function unionLaneKey(familyId: FamilyId): string {
  return `${familyId}|union`
}

/** 層をまたぐ縦線を結合点のxから別のxへ移すための、結合点のすぐ下の隙間での横区間のキー */
function shiftLaneKey(familyId: FamilyId, childGeneration: number): string {
  return `${familyId}|${childGeneration}|shift`
}

/** 系線がカードへどこまで近づいてよいかの余白。カードの縁に接して見えない程度に取る */
const LINE_CARD_MARGIN = 8

/** 同一xでy範囲の重なる縦線どうしを分離する際のずらし幅 */
const VERTICAL_RUN_OFFSET = 4

/** 交差回避の判定に使う、行(層)ごとのカードのx区間 */
interface RowCard {
  personId: PersonId
  left: number
  right: number
}

function buildRowCards(persons: PersonPosition[]): Map<number, RowCard[]> {
  const rows = new Map<number, RowCard[]>()
  for (const p of persons) {
    const list = rows.get(p.generation) ?? []
    list.push({ personId: p.personId, left: p.x, right: p.x + CARD_SIZE.width })
    rows.set(p.generation, list)
  }
  for (const list of rows.values()) {
    list.sort((a, b) => a.left - b.left || a.personId.localeCompare(b.personId))
  }
  return rows
}

/**
 * 婚姻線をカード中心の高さの直線で引いたとき、配偶者以外のカードを貫通するかどうか。
 * 層内の並び替え(ordering.ts)は重婚者を配偶者たちの間に置こうとするが、3人以上の配偶者や
 * 他の制約との兼ね合いで、間に他人が挟まる並びは残りうる。その場合は直線をやめて
 * レーン経由のエルボーへ切り替える(buildLinksAndFamilies参照)
 */
function marriageCrossesOtherCards(
  spousePoints: Array<{ id: PersonId; x: number }>,
  generation: number,
  rowCards: Map<number, RowCard[]>,
): boolean {
  const spouseIdSet = new Set(spousePoints.map((p) => p.id))
  const left = spousePoints.reduce(
    (min, p) => Math.min(min, p.x),
    Number.POSITIVE_INFINITY,
  )
  const right = spousePoints.reduce(
    (max, p) => Math.max(max, p.x),
    Number.NEGATIVE_INFINITY,
  )
  for (const card of rowCards.get(generation) ?? []) {
    if (spouseIdSet.has(card.personId)) continue
    if (card.left < right && card.right > left) return true
  }
  return false
}

/** スナップの結果。xと、xが属する「全通過行に共通の隙間」の範囲 */
interface SnappedX {
  x: number
  /** 縦線どうしの分離オフセット(separateVerticalRuns)もこの範囲内に収める */
  lo: number
  hi: number
}

/**
 * 層をまたぐ縦線のx座標を、通過するすべての行でカードに重ならない位置へスナップする。
 *
 * 通過行のカードのx範囲(線がカードの縁に接して見えないよう LINE_CARD_MARGIN を足す)を
 * すべて集めて1つの禁止区間の列へマージすると、その補集合が「全通過行に共通の隙間」になる。
 * xが既に隙間の中にあればそのまま、カードに重なっているなら最も近い隙間の端へ寄せる
 * (等距離の隙間が左右にある場合は左を選び、結果を決定的にする)。
 *
 * 補集合は行の左右の外側を必ず含むため「共通の隙間が見つからない」ことは起きないが、
 * 通過行が広く詰まっている場合は、行の外側まで大きく迂回したxが選ばれうるという限界がある
 * (迂回距離に上限は設けていない。遠くても、それがカード交差ゼロで最も近い位置であるため)
 */
function snapVerticalX(
  x: number,
  rows: number[],
  rowCards: Map<number, RowCard[]>,
): SnappedX {
  const forbidden: Array<{ lo: number; hi: number }> = []
  for (const generation of rows) {
    for (const card of rowCards.get(generation) ?? []) {
      forbidden.push({
        lo: card.left - LINE_CARD_MARGIN,
        hi: card.right + LINE_CARD_MARGIN,
      })
    }
  }
  forbidden.sort((a, b) => a.lo - b.lo || a.hi - b.hi)
  const merged: Array<{ lo: number; hi: number }> = []
  for (const block of forbidden) {
    const last = merged[merged.length - 1]
    if (last && block.lo <= last.hi) last.hi = Math.max(last.hi, block.hi)
    else merged.push({ ...block })
  }

  let best: SnappedX | undefined
  const consider = (lo: number, hi: number): void => {
    const clamped = Math.min(Math.max(x, lo), hi)
    if (best === undefined || Math.abs(clamped - x) < Math.abs(best.x - x))
      best = { x: clamped, lo, hi }
  }
  consider(
    Number.NEGATIVE_INFINITY,
    merged.length > 0 ? merged[0].lo : Number.POSITIVE_INFINITY,
  )
  for (let i = 0; i + 1 < merged.length; i++)
    consider(merged[i].hi, merged[i + 1].lo)
  if (merged.length > 0)
    consider(merged[merged.length - 1].hi, Number.POSITIVE_INFINITY)
  return (
    best ?? { x, lo: Number.NEGATIVE_INFINITY, hi: Number.POSITIVE_INFINITY }
  )
}

/** 層をまたぐ縦線1本(束ごとに1本)。分離オフセットの計算に使う */
interface VerticalRun {
  familyId: FamilyId
  childGeneration: number
  /** 縦線の上端(結合点)側の世代。下端は childGeneration のすぐ上の隙間 */
  topGeneration: number
  snapped: SnappedX
}

/**
 * 同一xでy範囲の重なる縦線どうしを、小さなオフセットで左右に分離する。
 * 別々の家族の縦線が完全に重なると1本の線に見え、どの結合点とどの子がつながるのか
 * 読み取れなくなるための処置。束キー→最終的なxの表を返す。
 *
 * - 同じ家族の束どうし(1つの結合点から深さの違う子たちへ降りる縦線)は同じ幹として
 *   重なるのが正しいため分離せず、常に同じxを与える
 * - xの一致は厳密比較で判定する(スナップで同じ隙間の端へ寄った線と、もともと同じ
 *   結合点xを持つ線が対象。数px違いの近接は分離しない)
 * - オフセット後もスナップの許可区間へクランプするため、隙間が狭い場合は分離しきれず
 *   近接したまま残ることがある(カード貫通を優先して避ける)
 */
function separateVerticalRuns(runs: VerticalRun[]): Map<string, number> {
  const byX = new Map<number, VerticalRun[]>()
  for (const run of runs) {
    const list = byX.get(run.snapped.x) ?? []
    list.push(run)
    byX.set(run.snapped.x, list)
  }

  const result = new Map<string, number>()
  for (const group of byX.values()) {
    const byFamily = new Map<FamilyId, VerticalRun[]>()
    for (const run of group) {
      const list = byFamily.get(run.familyId) ?? []
      list.push(run)
      byFamily.set(run.familyId, list)
    }
    const entities = [...byFamily.entries()].sort((a, b) =>
      a[0].localeCompare(b[0]),
    )
    const placed: Array<{ top: number; bottom: number; level: number }> = []
    for (const [, familyRuns] of entities) {
      const top = familyRuns.reduce(
        (min, r) => Math.min(min, r.topGeneration),
        Number.POSITIVE_INFINITY,
      )
      const bottom = familyRuns.reduce(
        (max, r) => Math.max(max, r.childGeneration),
        Number.NEGATIVE_INFINITY,
      )
      // y範囲(世代の開区間)が重なる先客の使っている段を避け、最小の空き段を取る
      const usedLevels = new Set(
        placed
          .filter((p) => p.top < bottom && top < p.bottom)
          .map((p) => p.level),
      )
      let level = 0
      while (usedLevels.has(level)) level++
      placed.push({ top, bottom, level })
      const lo = familyRuns.reduce(
        (max, r) => Math.max(max, r.snapped.lo),
        Number.NEGATIVE_INFINITY,
      )
      const hi = familyRuns.reduce(
        (min, r) => Math.min(min, r.snapped.hi),
        Number.POSITIVE_INFINITY,
      )
      const x = Math.min(
        Math.max(familyRuns[0].snapped.x + VERTICAL_RUN_OFFSET * level, lo),
        hi,
      )
      for (const run of familyRuns)
        result.set(busKey(run.familyId, run.childGeneration), x)
    }
  }
  return result
}

/**
 * 結合点の置き方。
 * - `row`: カードの行(中心の高さ)に置く従来の形。配偶者が横並びで隣接している通常の家族
 * - `lane`: 層間の隙間のレーン上に置く。婚姻線を直線で引けない家族(間に他人が挟まる・
 *   層が割れている)と、配偶者が1人も配置されていない家族が使う
 */
type UnionPlacement = { kind: 'row' } | { kind: 'lane'; band: number }

/** 家族1つぶんの、系線と結合点を組み立てるための計画 */
interface FamilyPlan {
  familyId: FamilyId
  children: { childId: PersonId; pedigree: Pedigree }[]
  /** 配置済みの配偶者(x昇順、同値はID順) */
  spousePoints: Array<{ id: PersonId; x: number; generation: number }>
  unionX: number
  /** FamilyPositionへ載せる世代(0以上へクランプ済み) */
  unionGeneration: number
  placement: UnionPlacement
  /** 子のいる層 → 配置済みの子のx一覧(層番号の昇順) */
  childXsByGeneration: Array<[number, number[]]>
}

/** 縦線が結合点から降り始める世代。行を通過するかどうか(スナップの要否)の基準 */
function unionStartGeneration(plan: FamilyPlan): number {
  return plan.placement.kind === 'row'
    ? plan.unionGeneration
    : plan.placement.band
}

/**
 * 系線の経路と結合点の位置を求める(4.3, 4.4)。
 *
 * 婚姻線は、配偶者どうしが層内で隣接していれば従来どおりカード中心の高さの直線で結ぶ。
 * 隣接していない(重婚などで間に他人のカードが挟まる)場合や層が割れている(世代割り当てが
 * 未収束の循環データ等)場合は、各配偶者のカード中心から下の系線レーンへ降ろし、レーン上を
 * 水平に結ぶエルボー経路にする。結合点(FamilyPosition)もその水平区間の中点に置くため、
 * 「婚姻線が他人のカードを貫通する」「結合点が他人のカード中心に一致して、子への系線が
 * 無関係な人物から出て見える」という状態は構造的に起きない。
 *
 * 親子線は結合点から子への「エルボー」経路(結合点から下へ→層の隙間のレーンで横へ→
 * 子の真上から下へ)とする。横に走る高さは`assignLinkLanes`が束ごとに決めるため、無関係な
 * 家族の線がつながって見えることはなく、カードの並ぶ高さを横切ることもない。層をまたぐ
 * 縦線は`snapVerticalX`で中間の行のカードを避ける。
 *
 * 続柄(pedigree)は親子の組ごとに、渡された`family.children`からそのまま引き継ぐため、
 * 同一人物が複数の親家族を持つ場合も、家族ごとに正しい続柄の系線が別々に得られる
 * (spec「系線の種別と続柄の保持」「実親と養親の双方を持つ人物」)。
 */
function buildLinksAndFamilies(
  graph: PedigreeGraph,
  generationOf: Map<PersonId, number>,
  centerXOf: Map<PersonId, number>,
  persons: PersonPosition[],
): { families: FamilyPosition[]; links: PedigreeLink[] } {
  const rowCards = buildRowCards(persons)

  // --- 1. 家族ごとの計画(結合点の置き方とx)を決める ---
  const plans: FamilyPlan[] = []
  for (const familyId of [...graph.families.keys()].sort()) {
    const family = graph.families.get(familyId)
    if (!family) continue

    const spousePoints = family.spouseIds
      .map((id) => ({
        id,
        x: centerXOf.get(id),
        generation: generationOf.get(id) ?? 0,
      }))
      .filter(
        (p): p is { id: PersonId; x: number; generation: number } =>
          p.x !== undefined,
      )
      .sort((a, b) => a.x - b.x || a.id.localeCompare(b.id))

    const childXsMap = new Map<number, number[]>()
    for (const child of family.children) {
      const x = centerXOf.get(child.childId)
      const childGeneration = generationOf.get(child.childId)
      if (x === undefined || childGeneration === undefined) continue
      childXsMap.set(childGeneration, [
        ...(childXsMap.get(childGeneration) ?? []),
        x,
      ])
    }
    const childXsByGeneration = [...childXsMap.entries()].sort(
      (a, b) => a[0] - b[0],
    )

    if (spousePoints.length === 0 && childXsByGeneration.length === 0) continue // どちらの端も配置されていない(頑健性)

    if (spousePoints.length > 0) {
      const unionGeneration = spousePoints.reduce(
        (min, p) => Math.min(min, p.generation),
        Number.POSITIVE_INFINITY,
      )
      // 結合点のx。配偶者2人以上なら**婚姻線のちょうど真ん中**に置く。「子たちの中央へ寄せる」
      // 調整をここで行うと、子が夫婦の真下から離れているときに結合点が端の配偶者側へ寄り切り、
      // 子への系線がその人物のカードから直接出ているように見えてしまう。子の位置へ寄せる調整は
      // カードの配置(x座標の緩和)が受け持ち、結合点は夫婦の真ん中に付いてくる役割分担にする
      const unionX =
        spousePoints.length >= 2
          ? (spousePoints[0].x + spousePoints[spousePoints.length - 1].x) / 2
          : spousePoints[0].x
      const sameGeneration = spousePoints.every(
        (p) => p.generation === unionGeneration,
      )
      const needsElbow =
        spousePoints.length >= 2 &&
        (!sameGeneration ||
          marriageCrossesOtherCards(spousePoints, unionGeneration, rowCards))
      plans.push({
        familyId,
        children: family.children,
        spousePoints,
        unionX,
        unionGeneration,
        placement: needsElbow
          ? { kind: 'lane', band: unionGeneration }
          : { kind: 'row' },
        childXsByGeneration,
      })
    } else {
      // 配偶者が1人も配置されていない(欠損参照だけが残った)家族。子だけが根拠なので、
      // 結合点は「最上位の子の層のすぐ上のレーン帯」に置く。世代は子の層-1だが、子が層0の
      // 場合に-1へ落ちないよう0以上へクランプする(レーン帯自体は負のyになりうるが、
      // それはnormalizeToOriginの平行移動が引き受ける)
      const minChildGeneration = childXsByGeneration[0][0]
      let sum = 0
      let count = 0
      for (const [, xs] of childXsByGeneration) {
        for (const x of xs) {
          sum += x
          count += 1
        }
      }
      plans.push({
        familyId,
        children: family.children,
        spousePoints,
        unionX: sum / count,
        unionGeneration: Math.max(0, minChildGeneration - 1),
        placement: { kind: 'lane', band: minChildGeneration - 1 },
        childXsByGeneration,
      })
    }
  }

  // --- 2. 層をまたぐ縦線のxを決める(スナップ+分離) ---
  const runs: VerticalRun[] = []
  for (const plan of plans) {
    const startGeneration = unionStartGeneration(plan)
    for (const [childGeneration] of plan.childXsByGeneration) {
      const crossedRows: number[] = []
      for (let g = startGeneration + 1; g < childGeneration; g++)
        crossedRows.push(g)
      // 直下の子は行を通過しない。循環データで子が結合点より上にいる場合(上向きの線)も
      // 稀な異常系としてスナップの対象にしない
      if (crossedRows.length === 0) continue
      runs.push({
        familyId: plan.familyId,
        childGeneration,
        topGeneration: startGeneration,
        snapped: snapVerticalX(plan.unionX, crossedRows, rowCards),
      })
    }
  }
  const verticalXOf = separateVerticalRuns(runs)
  const verticalX = (plan: FamilyPlan, childGeneration: number): number =>
    verticalXOf.get(busKey(plan.familyId, childGeneration)) ?? plan.unionX

  // --- 3. 横に走る区間をレーン割り当てへ集める ---
  //
  // 束(家族 × 子のいる層)ごとに、横に走る区間を「子のいる層のすぐ上の隙間」へ集める。
  // 束を親のすぐ下の隙間へ置くと、層をまたぐ親子(婚入して数世代下へ移った人物など)の
  // 横線が、上の層の混み合った隙間を端から端まで横断してしまう。子のすぐ上に置けば、
  // どの横線も「その線がつなぐ子たちの真上」にあり、長い移動は縦線が受け持つ。
  // 同じ家族でも子の層が違えば別の束になるため、一部の子だけが下の層にいる家族は
  // 「近くの子への短い束」と「遠くの子への束」に分かれる。
  //
  // 加えて、結合点がレーン上にある家族の水平区間(unionLaneKey)と、スナップされた縦線への
  // 行内の横移動(shiftLaneKey)も同じ機構へ参加させ、互いに重ならない高さを取る
  const bands = new Map<number, LinkBusInterval[]>()
  const addInterval = (band: number, interval: LinkBusInterval): void => {
    const list = bands.get(band) ?? []
    list.push(interval)
    bands.set(band, list)
  }
  for (const plan of plans) {
    const startGeneration = unionStartGeneration(plan)

    if (plan.placement.kind === 'lane') {
      // 結合点レーンの水平区間: 配偶者の降ろし点・直下の子・層をまたぐ縦線の取り付き点を覆う
      let left = plan.unionX
      let right = plan.unionX
      const cover = (x: number): void => {
        if (x < left) left = x
        if (x > right) right = x
      }
      for (const p of plan.spousePoints) cover(p.x)
      for (const [childGeneration, xs] of plan.childXsByGeneration) {
        if (childGeneration <= plan.placement.band + 1) {
          for (const x of xs) cover(x)
        } else {
          cover(verticalX(plan, childGeneration))
        }
      }
      addInterval(plan.placement.band, {
        key: unionLaneKey(plan.familyId),
        left,
        right,
      })
    }

    for (const [childGeneration, xs] of plan.childXsByGeneration) {
      const direct = childGeneration <= startGeneration + 1
      if (plan.placement.kind === 'lane' && direct) continue // 直下の子は結合点レーンで受ける(束なし)

      const vx = direct ? plan.unionX : verticalX(plan, childGeneration)
      let left = vx
      let right = vx
      for (const x of xs) {
        if (x < left) left = x
        if (x > right) right = x
      }
      addInterval(childGeneration - 1, {
        key: busKey(plan.familyId, childGeneration),
        left,
        right,
      })

      // 結合点が行にある家族で縦線がスナップされた場合、結合点のすぐ下の隙間で
      // 結合点x→縦線xの横移動が要る
      if (plan.placement.kind === 'row' && !direct && vx !== plan.unionX) {
        addInterval(startGeneration, {
          key: shiftLaneKey(plan.familyId, childGeneration),
          left: Math.min(plan.unionX, vx),
          right: Math.max(plan.unionX, vx),
        })
      }
    }
  }
  const lanes = assignLinkLanes(bands)

  // 帯(band)は「層bandと層band+1の間の隙間」。レーンをこの帯の内側で等間隔に配ることで、
  // どの横線もカードの並ぶ高さを横切らない
  const laneYOf = (band: number, key: string): number => {
    const { lane, laneCount } = lanes.get(key) ?? { lane: 0, laneCount: 1 }
    const bandTop = rowTop(band + 1) - VERTICAL_GAP
    return bandTop + (VERTICAL_GAP * (lane + 1)) / (laneCount + 1)
  }

  // --- 4. 結合点と系線を組み立てる ---
  const families: FamilyPosition[] = []
  const links: PedigreeLink[] = []
  for (const plan of plans) {
    const startGeneration = unionStartGeneration(plan)
    const unionY =
      plan.placement.kind === 'row'
        ? rowTop(plan.unionGeneration) + CARD_SIZE.height / 2
        : laneYOf(plan.placement.band, unionLaneKey(plan.familyId))
    families.push({
      familyId: plan.familyId,
      generation: plan.unionGeneration,
      x: plan.unionX,
      y: unionY,
    })

    if (plan.spousePoints.length >= 2) {
      const first = plan.spousePoints[0]
      const last = plan.spousePoints[plan.spousePoints.length - 1]
      const points: LinkPoint[] =
        plan.placement.kind === 'row'
          ? plan.spousePoints.map((p): LinkPoint => ({ x: p.x, y: unionY }))
          : [
              // 各配偶者の点をそれぞれの行(自分のカード中心)の高さで打ち、縦線でレーンへ
              // 降ろして水平に結ぶ。層が割れた配偶者どうし(未収束の循環データ)もこの形で結べる
              {
                x: first.x,
                y: rowTop(first.generation) + CARD_SIZE.height / 2,
              },
              { x: first.x, y: unionY },
              { x: last.x, y: unionY },
              { x: last.x, y: rowTop(last.generation) + CARD_SIZE.height / 2 },
            ]
      links.push({
        kind: 'marriage',
        familyId: plan.familyId,
        spouseIds: plan.spousePoints.map((p) => p.id),
        points,
      })
    }

    const children = [...plan.children].sort((a, b) =>
      a.childId.localeCompare(b.childId),
    )
    for (const child of children) {
      const childX = centerXOf.get(child.childId)
      const childGeneration = generationOf.get(child.childId)
      if (childX === undefined || childGeneration === undefined) continue

      const direct = childGeneration <= startGeneration + 1
      // 子のカードの上端で受ける(カード中心まで引くと、線がカードの上に重なって見える)
      const childY = rowTop(childGeneration)
      let points: LinkPoint[]

      if (plan.placement.kind === 'lane' && direct) {
        // 結合点が既にレーン上にあるので、そのまま水平に移動して子の真上から降ろす
        points = [
          { x: plan.unionX, y: unionY },
          { x: childX, y: unionY },
          { x: childX, y: childY },
        ]
      } else {
        const busLaneY = laneYOf(
          childGeneration - 1,
          busKey(plan.familyId, childGeneration),
        )
        const vx = direct ? plan.unionX : verticalX(plan, childGeneration)
        if (vx === plan.unionX) {
          points = [
            { x: plan.unionX, y: unionY },
            { x: plan.unionX, y: busLaneY },
            { x: childX, y: busLaneY },
            { x: childX, y: childY },
          ]
        } else if (plan.placement.kind === 'lane') {
          // 結合点レーン上で縦線のxまで横移動してから降りる
          points = [
            { x: plan.unionX, y: unionY },
            { x: vx, y: unionY },
            { x: vx, y: busLaneY },
            { x: childX, y: busLaneY },
            { x: childX, y: childY },
          ]
        } else {
          // 結合点は行の中心にあるので、すぐ下の隙間のレーンで縦線のxまで横移動する
          const shiftY = laneYOf(
            startGeneration,
            shiftLaneKey(plan.familyId, childGeneration),
          )
          points = [
            { x: plan.unionX, y: unionY },
            { x: plan.unionX, y: shiftY },
            { x: vx, y: shiftY },
            { x: vx, y: busLaneY },
            { x: childX, y: busLaneY },
            { x: childX, y: childY },
          ]
        }
      }

      links.push({
        kind: 'parent-child',
        familyId: plan.familyId,
        childId: child.childId,
        pedigree: child.pedigree,
        points,
      })
    }
  }

  return { families, links }
}

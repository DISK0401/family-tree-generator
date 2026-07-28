import type { PersonId } from '../domain/types'
import type { PedigreeGraph } from './graph'

/** 層(世代)ごとの人物の並び順。配列の添字が層内の左から右への位置を表す */
export type LayerOrder = Map<number, PersonId[]>

/**
 * 層内の並び替えの単位(design.md D2-2)。同じ世代に属する配偶者どうしは1つの単位として
 * まとめ、常に隣接させる。単身の人物(配偶者がいない、または配偶者が別の層にいる)は
 * 1人だけの単位になる。人物1人は必ずちょうど1つの単位にのみ属する
 */
interface Unit {
  /** 全順序比較のタイブレークに使う決定的な識別子(構成人物の最小ID) */
  key: PersonId
  personIds: PersonId[]
}

/**
 * 各人物をちょうど1つの単位へ割り当て、世代ごとにまとめる(順序未確定)。
 * 家族ID昇順に調べ、配偶者全員が同じ世代に揃っている最初の家族を、その配偶者たちの単位として
 * 採用する。既にどこかの単位に組み込まれた人物(重婚等)は対象にしない — 夫婦の隣接を
 * 全ての婚姻について同時に満たすことはできないため、最初に見つかった婚姻を優先する割り切りとする。
 * 世代が割れている(生成割り当てが未収束等の)配偶者どうしは単位にまとめず、それぞれ単身とする
 */
function groupIntoUnits(
  graph: PedigreeGraph,
  generationOf: Map<PersonId, number>,
): Map<number, Unit[]> {
  const unitOfPerson = new Map<PersonId, Unit>()

  for (const familyId of [...graph.families.keys()].sort()) {
    const family = graph.families.get(familyId)
    if (!family || family.spouseIds.length < 2) continue
    if (family.spouseIds.some((id) => unitOfPerson.has(id))) continue
    const generations = new Set(
      family.spouseIds.map((id) => generationOf.get(id) ?? 0),
    )
    if (generations.size > 1) continue
    const key = [...family.spouseIds].sort()[0]
    const unit: Unit = { key, personIds: [...family.spouseIds] }
    for (const id of family.spouseIds) unitOfPerson.set(id, unit)
  }

  for (const id of [...graph.persons.keys()].sort()) {
    if (!unitOfPerson.has(id))
      unitOfPerson.set(id, { key: id, personIds: [id] })
  }

  const byGeneration = new Map<number, Unit[]>()
  const seen = new Set<Unit>()
  for (const id of [...graph.persons.keys()].sort()) {
    const unit = unitOfPerson.get(id)
    if (!unit || seen.has(unit)) continue
    seen.add(unit)
    const generation = Math.min(
      ...unit.personIds.map((personId) => generationOf.get(personId) ?? 0),
    )
    const list = byGeneration.get(generation) ?? []
    list.push(unit)
    byGeneration.set(generation, list)
  }
  return byGeneration
}

function flattenToLayerOrder(
  unitsByGeneration: Map<number, Unit[]>,
): LayerOrder {
  const order: LayerOrder = new Map()
  for (const [generation, units] of unitsByGeneration) {
    order.set(
      generation,
      units.flatMap((unit) => unit.personIds),
    )
  }
  return order
}

function cloneUnitsMap(map: Map<number, Unit[]>): Map<number, Unit[]> {
  return new Map(
    [...map.entries()].map(([generation, units]) => [generation, [...units]]),
  )
}

/**
 * 単位の直近の親家族を探し、その位置ときょうだい内の順位を返す。
 * 上の層であればよく、1つ上の層に限定しない(限定すると、実家が2層以上離れた婚入者が
 * 「親が見つからない」扱いで層の末尾へ回され、子から遠く離れた位置に固定されてしまう)。
 * 最も近い層の親家族を優先する
 */
function findParentRank(
  unit: Unit,
  graph: PedigreeGraph,
  generationOf: Map<PersonId, number>,
  previousPositions: Map<PersonId, number>,
): { position: number; siblingRank: number } | undefined {
  let best:
    { position: number; siblingRank: number; distance: number } | undefined
  for (const memberId of [...unit.personIds].sort()) {
    const node = graph.persons.get(memberId)
    if (!node) continue
    for (const familyId of [...node.parentFamilyIds].sort()) {
      const family = graph.families.get(familyId)
      if (!family || family.spouseIds.length === 0) continue
      const familyGeneration = Math.min(
        ...family.spouseIds.map((id) => generationOf.get(id) ?? 0),
      )
      const memberGeneration = generationOf.get(memberId) ?? 0
      const distance = memberGeneration - familyGeneration
      if (distance <= 0) continue
      if (best !== undefined && distance >= best.distance) continue
      const positions = family.spouseIds
        .map((id) => previousPositions.get(id))
        .filter((p): p is number => p !== undefined)
      if (positions.length === 0) continue
      const position =
        positions.reduce((sum, p) => sum + p, 0) / positions.length
      const siblingRank = family.children.findIndex(
        (c) => c.childId === memberId,
      )
      best = { position, siblingRank, distance }
    }
  }
  return best
}

/**
 * 層内の初期順序を単位単位で決める(design.md D2-2, tasks.md 3.1)。
 *
 * 最上位の層は単位の識別子(構成人物の最小ID)で並べる。それより下の層は、各単位を
 * 「1つ上の層にいる親の単位の位置」で並べ、同じ親を持つ単位(きょうだい)は
 * 家族内の登録順(family.children配列の順)で連続させる。親が見つからない単位
 * (孤立した人物・独立した家族クラスタ・層をまたぐ関係の子)は、位置が確定した単位より後ろへ、
 * 単位の識別子順で置く
 */
function buildInitialUnitOrder(
  graph: PedigreeGraph,
  generationOf: Map<PersonId, number>,
): Map<number, Unit[]> {
  const unitsByGeneration = groupIntoUnits(graph, generationOf)
  const generations = [...unitsByGeneration.keys()].sort((a, b) => a - b)
  const result = new Map<number, Unit[]>()
  // 確定済みの層すべての位置を持ち回る。親家族が1つ上の層とは限らないため
  // (婚入者の実家は2層以上離れうる。findParentRank参照)、直前の層だけでは足りない。
  // 層ごとに人数が違うので、比較できるよう0〜1へ正規化した位置を入れる
  const settledPositions = new Map<PersonId, number>()

  for (const generation of generations) {
    const units = unitsByGeneration.get(generation) ?? []
    const decorated = units.map((unit) => {
      const parent = findParentRank(unit, graph, generationOf, settledPositions)
      return {
        unit,
        parentPosition: parent?.position ?? Number.POSITIVE_INFINITY,
        siblingRank: parent?.siblingRank ?? Number.POSITIVE_INFINITY,
      }
    })
    decorated.sort((a, b) => {
      if (a.parentPosition !== b.parentPosition)
        return a.parentPosition - b.parentPosition
      if (a.siblingRank !== b.siblingRank) return a.siblingRank - b.siblingRank
      return a.unit.key.localeCompare(b.unit.key) // 同値は人物IDで決着させる(spec「レイアウトの決定性」)
    })
    const orderedUnits = decorated.map((d) => d.unit)
    result.set(generation, orderedUnits)
    const ids = orderedUnits.flatMap((unit) => unit.personIds)
    const last = Math.max(ids.length - 1, 1)
    ids.forEach((personId, index) =>
      settledPositions.set(personId, index / last),
    )
  }

  return result
}

/** 層内の初期順序(単位単位)をそのまま`LayerOrder`として返す(重心法適用前) */
export function buildInitialOrder(
  graph: PedigreeGraph,
  generationOf: Map<PersonId, number>,
): LayerOrder {
  return flattenToLayerOrder(buildInitialUnitOrder(graph, generationOf))
}

/**
 * 層内での位置を0〜1へ正規化した表。層ごとに人数が違うため(この家系図では8人の層と13人の層が
 * 隣り合う)、生の添字のまま層をまたいで平均すると、人数の多い層の位置が過大に効いてしまう。
 */
function normalizedPositions(
  unitsByGeneration: Map<number, Unit[]>,
): Map<PersonId, number> {
  const normalized = new Map<PersonId, number>()
  for (const units of unitsByGeneration.values()) {
    const ids = units.flatMap((unit) => unit.personIds)
    const last = Math.max(ids.length - 1, 1)
    ids.forEach((personId, index) => normalized.set(personId, index / last))
  }
  return normalized
}

/**
 * 単位からみて親側 or 子側にいる、家族関係でつながった人物の正規化位置の一覧を返す。重心の算出に使う。
 *
 * **隣の層に限定しない**。婚入した配偶者は相手の層へ引き上げ/引き下げられるため、その人物の実家が
 * 2層以上離れることは珍しくない(実データでは、孫の世代へ嫁いだ人物の実家が3層上にあった)。
 * 隣の層だけを見ると、そうした家族は「基準が無い」と判定されて層の末尾へ固定され、
 * 子から遠く離れた位置に置かれてしまう。結果として、図の端から端まで走る長い系線が生まれ、
 * 無関係な家族のカードの下をくぐって読めなくなる。
 *
 * 加えて、**単位の外にいる婚姻相手**(重婚により別の単位へ取り込まれた配偶者。groupIntoUnits参照)
 * の位置も、上下どちらのパスでも基準に含める。これを含めないと、重婚者の単位とその配偶者の単位は
 * 互いに引き合う理由を持たず、婚姻線が層内で他人のカードをまたいで走る並びのまま動かない
 */
function collectNeighborPositions(
  unit: Unit,
  graph: PedigreeGraph,
  generationOf: Map<PersonId, number>,
  normalized: Map<PersonId, number>,
  direction: 'up' | 'down',
): number[] {
  const unitGeneration = Math.min(
    ...unit.personIds.map((id) => generationOf.get(id) ?? 0),
  )
  const positions: number[] = []

  for (const memberId of unit.personIds) {
    const node = graph.persons.get(memberId)
    if (!node) continue
    if (direction === 'up') {
      for (const familyId of node.parentFamilyIds) {
        const family = graph.families.get(familyId)
        if (!family || family.spouseIds.length === 0) continue
        const familyGeneration = Math.min(
          ...family.spouseIds.map((id) => generationOf.get(id) ?? 0),
        )
        if (familyGeneration >= unitGeneration) continue
        for (const spouseId of family.spouseIds) {
          const pos = normalized.get(spouseId)
          if (pos !== undefined) positions.push(pos)
        }
      }
    } else {
      for (const familyId of node.spouseFamilyIds) {
        const family = graph.families.get(familyId)
        if (!family) continue
        for (const child of family.children) {
          if ((generationOf.get(child.childId) ?? -1) <= unitGeneration)
            continue
          const pos = normalized.get(child.childId)
          if (pos !== undefined) positions.push(pos)
        }
      }
    }
    // 単位の外にいる同じ層の婚姻相手。婚姻線は層内の横方向の辺なので、
    // 親側・子側のどちらのパスでも同じように効かせる
    for (const familyId of node.spouseFamilyIds) {
      const family = graph.families.get(familyId)
      if (!family) continue
      for (const spouseId of family.spouseIds) {
        if (unit.personIds.includes(spouseId)) continue
        if ((generationOf.get(spouseId) ?? 0) !== unitGeneration) continue
        const pos = normalized.get(spouseId)
        if (pos !== undefined) positions.push(pos)
      }
    }
  }
  return positions
}

function average(values: number[]): number | undefined {
  if (values.length === 0) return undefined
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/**
 * 重心法による1回分の並び替え(design.md D2-2, tasks.md 3.2)。
 * 下方向のパスでは各層を上から順に、1つ上の層(直近の親)の位置の平均で並べ替える。
 * 上方向のパスでは逆に、1つ下の層(直近の子)の位置の平均で並べ替える。
 * 隣接関係を持たない単位(孤立した人物・独立したクラスタ)は動かす基準がないため末尾へ固定する。
 * 同値は単位の識別子(人物ID)で決着させ、全順序を保つ(spec「レイアウトの決定性」)
 */
function sweepOnce(
  unitsByGeneration: Map<number, Unit[]>,
  generations: number[],
  graph: PedigreeGraph,
  generationOf: Map<PersonId, number>,
  direction: 'down' | 'up',
): void {
  const order = direction === 'down' ? generations : [...generations].reverse()
  for (const generation of order) {
    const units = unitsByGeneration.get(generation)
    if (!units) continue

    // 層をまたぐ関係も基準にするため、毎回すべての層の正規化位置を取り直す
    const normalized = normalizedPositions(unitsByGeneration)
    const lookupDirection = direction === 'down' ? 'up' : 'down'
    const decorated = units.map((unit) => ({
      unit,
      value: average(
        collectNeighborPositions(
          unit,
          graph,
          generationOf,
          normalized,
          lookupDirection,
        ),
      ),
    }))
    decorated.sort((a, b) => {
      if (a.value === undefined && b.value === undefined)
        return a.unit.key.localeCompare(b.unit.key)
      if (a.value === undefined) return 1
      if (b.value === undefined) return -1
      if (a.value !== b.value) return a.value - b.value
      return a.unit.key.localeCompare(b.unit.key)
    })
    unitsByGeneration.set(
      generation,
      decorated.map((d) => d.unit),
    )
  }
}

/**
 * 配列の厳密な反転数(i < j かつ values[i] > values[j] であるペアの数)をマージソートで数える。
 * 全ペアを直接比較するとO(n^2)になるため、マージの際に「左側の残り要素数」をまとめて
 * 加算する定石でO(n log n)に抑える。等しい値のペアは反転に数えない(左側を先に取り出す)
 */
function countInversions(values: number[]): number {
  const buffer = [...values]
  const work = new Array<number>(values.length)
  let total = 0

  for (let width = 1; width < buffer.length; width *= 2) {
    for (let left = 0; left + width < buffer.length; left += width * 2) {
      const mid = left + width
      const right = Math.min(mid + width, buffer.length)
      let i = left
      let j = mid
      let k = left
      while (i < mid && j < right) {
        if (buffer[i] <= buffer[j]) {
          work[k++] = buffer[i++]
        } else {
          // buffer[i] > buffer[j]: 左側の残り(i..mid-1)すべてがこのjと反転している
          total += mid - i
          work[k++] = buffer[j++]
        }
      }
      while (i < mid) work[k++] = buffer[i++]
      while (j < right) work[k++] = buffer[j++]
      for (let t = left; t < right; t++) buffer[t] = work[t]
    }
  }

  return total
}

/**
 * 隣接する2つの層の間にある系線の交差数を数える(design.md「交差の多い図になる」の検証用)。
 * 家族(結合点)の位置は、その配偶者たちの層内位置の平均で近似する。
 *
 * 2辺(p1,c1)(p2,c2)が交差するのは (p1-p2)*(c1-c2) < 0 のとき。つまり親側の順序と
 * 子側の順序が逆転している厳密な反転のみを1と数え、どちらかの端点を共有する
 * (親位置または子位置が等しい)ペアは交差に数えない。全ペア比較はO(E^2)で辺数に対して
 * 急激に遅くなるため、「親位置の昇順(同値は子位置の昇順)に並べて子位置の反転数を数える」
 * 形へ帰着させ、マージソートでO(E log E)にする。並べ替え後は i < j なら p_i <= p_j であり、
 * p_i = p_j のグループ内は子位置も昇順なので反転に現れず、数えるペアは元の定義と厳密に一致する
 */
export function countCrossings(
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
    for (const family of graph.families.values()) {
      const spousePositions = family.spouseIds
        .map((id) => parentPositions.get(id))
        .filter((p): p is number => p !== undefined)
      if (spousePositions.length === 0) continue
      const parentPosition =
        spousePositions.reduce((sum, p) => sum + p, 0) / spousePositions.length
      for (const child of family.children) {
        if ((generationOf.get(child.childId) ?? -1) !== childGeneration)
          continue
        const childPosition = childPositions.get(child.childId)
        if (childPosition === undefined) continue
        edges.push([parentPosition, childPosition])
      }
    }

    edges.sort((a, b) => a[0] - b[0] || a[1] - b[1])
    total += countInversions(edges.map((edge) => edge[1]))
  }

  return total
}

/** 重心法の往復回数(design.md「層内の往復回数の既定値。実データで交差の減り方を見て決める」= Open Question) */
const SWEEP_DIRECTIONS: Array<'down' | 'up'> = ['down', 'up', 'down', 'up']

/**
 * 同じ層にいながら1つの単位にまとめられなかった配偶者ペア(重婚の2つ目以降の婚姻。
 * groupIntoUnits参照)を列挙する。単位にまとまったペアは常に隣接するため採点する必要がないが、
 * まとまらなかったペアの婚姻線は並び方しだいで層内の他人のカードをまたいで走るため、
 * 親子線と同じく「短いほうがよい辺」として採点(totalEdgeSpan)の対象へ加える
 */
function collectLooseSpouseEdges(
  graph: PedigreeGraph,
  generationOf: Map<PersonId, number>,
  unitsByGeneration: Map<number, Unit[]>,
): Array<[PersonId, PersonId]> {
  const unitOf = new Map<PersonId, Unit>()
  for (const units of unitsByGeneration.values()) {
    for (const unit of units) {
      for (const id of unit.personIds) unitOf.set(id, unit)
    }
  }

  const edges: Array<[PersonId, PersonId]> = []
  for (const familyId of [...graph.families.keys()].sort()) {
    const family = graph.families.get(familyId)
    if (!family) continue
    for (let i = 0; i < family.spouseIds.length; i++) {
      for (let j = i + 1; j < family.spouseIds.length; j++) {
        const a = family.spouseIds[i]
        const b = family.spouseIds[j]
        if ((generationOf.get(a) ?? 0) !== (generationOf.get(b) ?? 0)) continue // 層が割れたペアは層内の辺ではない
        const unitA = unitOf.get(a)
        if (unitA !== undefined && unitA === unitOf.get(b)) continue // 単位にまとまったペアは常に隣接する
        edges.push([a, b])
      }
    }
  }
  return edges
}

/**
 * 親子線が層内をどれだけ横切るかの総量(正規化位置で測る)。
 *
 * 交差数だけを見て並びを選ぶと、交差はしていないが図の端から端まで走る長い系線が残る。
 * 実データで「無関係な家族のカードの下を長い線がくぐって読めない」状態が起きたのはこれが原因で、
 * 交差数では差が付かなかった。交差を最優先しつつ、同点なら線の短い並びを選ぶための第2の指標。
 *
 * 単位にまとめられなかった配偶者ペア(looseSpouseEdges)の婚姻線も同じ物差しで測る。
 * これにより重婚者を配偶者たちの間に置く並び(w1–夫–w2)が、婚姻線が他人をまたぐ並びより
 * 有利になる(交差数だけではこの差が付かない)
 */
function totalEdgeSpan(
  order: LayerOrder,
  graph: PedigreeGraph,
  generationOf: Map<PersonId, number>,
  looseSpouseEdges: Array<[PersonId, PersonId]>,
): number {
  const normalized = new Map<PersonId, number>()
  for (const ids of order.values()) {
    const last = Math.max(ids.length - 1, 1)
    ids.forEach((personId, index) => normalized.set(personId, index / last))
  }

  let total = 0
  for (const familyId of [...graph.families.keys()].sort()) {
    const family = graph.families.get(familyId)
    if (!family) continue
    const spousePositions = family.spouseIds
      .map((id) => normalized.get(id))
      .filter((p): p is number => p !== undefined)
    if (spousePositions.length === 0) continue
    const unionPosition =
      spousePositions.reduce((sum, p) => sum + p, 0) / spousePositions.length
    for (const child of family.children) {
      const childPosition = normalized.get(child.childId)
      if (childPosition === undefined) continue
      const generationGap = Math.max(
        (generationOf.get(child.childId) ?? 0) -
          Math.min(...family.spouseIds.map((id) => generationOf.get(id) ?? 0)),
        1,
      )
      // 層をまたぐ関係ほど長い縦線になるため、横方向の距離を層数ぶん重く見る
      total += Math.abs(unionPosition - childPosition) * generationGap
    }
  }

  for (const [a, b] of looseSpouseEdges) {
    const posA = normalized.get(a)
    const posB = normalized.get(b)
    if (posA === undefined || posB === undefined) continue
    total += Math.abs(posA - posB) // 同じ層の中の辺なので層数の重みは付けない
  }
  return total
}

/** 並びの採点。交差数を最優先し、同数のときだけ系線の長さで決める辞書式のタプル */
type OrderScore = readonly [crossings: number, span: number]

function compareScores(a: OrderScore, b: OrderScore): number {
  if (a[0] !== b[0]) return a[0] - b[0]
  return a[1] - b[1]
}

/**
 * 層内の並び順を決める(design.md D2-2)。初期順序(3.1)に重心法を上下方向へ往復させて適用し、
 * 系線の交差を減らす(3.2)。各パス後に「交差数」と「系線の長さの総量」で並びを採点し、
 * それまでで最良の並びを保持することで、発見的手法であっても初期順序より悪化した結果を返さない。
 * 採点は[交差数, 系線の長さ]の辞書式比較で行う。かつては`交差数 * 1000 + 長さ`という合成値
 * だったが、長さの総量が1000を超えると交差数の差より長さが勝ってしまい、
 * 「交差を最優先」の意図と食い違うため、比較そのものをタプルにした。
 * 比較はすべて全順序にし、同値は人物IDで決着させる(3.3, spec「レイアウトの決定性」)
 */
export function orderWithinLayers(
  graph: PedigreeGraph,
  generationOf: Map<PersonId, number>,
): LayerOrder {
  const initial = buildInitialUnitOrder(graph, generationOf)
  const generations = [...initial.keys()].sort((a, b) => a - b)
  // 単位の構成はスイープを通して変わらない(順序だけが入れ替わる)ため、ここで1回だけ求める
  const looseSpouseEdges = collectLooseSpouseEdges(graph, generationOf, initial)

  const score = (units: Map<number, Unit[]>): OrderScore => {
    const order = flattenToLayerOrder(units)
    return [
      countCrossings(order, graph, generationOf),
      totalEdgeSpan(order, graph, generationOf, looseSpouseEdges),
    ]
  }

  let best = cloneUnitsMap(initial)
  let bestScore = score(best)
  const current = cloneUnitsMap(initial)

  for (const direction of SWEEP_DIRECTIONS) {
    sweepOnce(current, generations, graph, generationOf, direction)
    const currentScore = score(current)
    if (compareScores(currentScore, bestScore) <= 0) {
      bestScore = currentScore
      best = cloneUnitsMap(current)
    }
  }

  return flattenToLayerOrder(best)
}

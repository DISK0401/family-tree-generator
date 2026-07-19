import { computeAge } from '../domain/age'
import { displayName } from '../domain/helpers'
import type { CalendarDate, Family, Pedigree, Person, PersonId, TreeDocument } from '../domain/types'

/**
 * TreeDocument → family-chart描画用データへの変換アダプタ。
 *
 * ドメインモデル(TreeDocument)を唯一の真実とし、family-chartの`Data`形式は
 * 描画直前にこの関数で射影するだけの使い捨てとする(design.md D1)。
 * family-chartのData形式に保存・編集を行わせてはならない。
 *
 * 既知の制約: family-chartの各人物は`rels.parents`を1組(最大2人)しか持てないため、
 * 同一人物が複数の家族に「子」として属する場合(実親+養親の両方など)、
 * 描画上の主たる親子線は実子(biological)より非実子(養子等)を優先して採用する
 * (design.md D2)。これはfamily-chart側の表現力の限界であり、データモデル自体は
 * 複数所属を保持し続ける(design.md リスク「family-chartの表現力限界」参照)。
 */

export interface FamilyChartCardData {
  personId: PersonId
  gender: 'M' | 'F' | 'U'
  displayName: string
  /** カード表示用。姓・名を別の縦書き列として描くために分離して持つ(6.3) */
  surname?: string
  given?: string
  birthYear?: number
  deathYear?: number
  /** 表示粒度設定(design.md D9)に応じた書式化に使う完全な生年月日・没年月日 */
  birthDate?: CalendarDate
  deathDate?: CalendarDate
  /** 現年齢(故人は没年齢)。生没年月日が年のみしか判明していない場合はundefined(design.md D8) */
  age?: number
  /** 没の記録(年不明でも)があれば故人として描く。カードのマーカー・†表示に使う */
  deceased: boolean
  /** この人物の主たる親子線(rels.parents)に対応する続柄種別。findRootAncestorの祖先方向判定に使う。
   * 系線のスタイル分岐は人物単位のこの値ではなく、辺(エッジ)単位の`buildPedigreeByEdge`を使う
   * (design.md リスク「family-chartの表現力限界」: 非主たる家族の辺も描画されうるため) */
  pedigree?: Pedigree
}

export interface FamilyChartDatum {
  id: PersonId
  data: FamilyChartCardData
  rels: {
    parents?: PersonId[]
    spouses?: PersonId[]
    children?: PersonId[]
  }
}

function toGender(gender: Person['gender']): 'M' | 'F' | 'U' {
  if (gender === 'male') return 'M'
  if (gender === 'female') return 'F'
  return 'U'
}

/**
 * 子の主たる親family(design.md D2)を返す。実子(biological)より非実子(養子・継子・里子・
 * 不明)を優先して採用し、同一人物が複数の非実子関係を持つ場合は出現順
 * (Object.values(doc.families)の順)にフォールバックする。`toFamilyChartData`の
 * `parentsByChild`(カードの`rels.parents`用)と`findRootAncestor`(祖先へのmain_id追従用)の
 * 両方が同じ優先順位で祖先方向をたどれるよう、判定ロジックをここに集約する。
 */
export function findPrimaryParentFamily(doc: TreeDocument, childId: PersonId): Family | undefined {
  let candidate: Family | undefined
  let candidatePedigree: Pedigree | undefined
  for (const family of Object.values(doc.families)) {
    const childLink = family.children.find((c) => c.childId === childId)
    if (!childLink) continue
    if (candidate === undefined || (candidatePedigree === 'biological' && childLink.pedigree !== 'biological')) {
      candidate = family
      candidatePedigree = childLink.pedigree
    }
  }
  return candidate
}

/**
 * 指定人物から親をたどれるだけたどった祖先(既知の中で最も上の代)を返す。
 *
 * family-chartは`main_id`を起点に祖先/子孫を展開する単一視点の描画方式のため、
 * 選択人物をそのままmain_idにすると、選択人物から見た祖先(=main_idにとっての
 * 祖先ではない祖父母等)の配偶者や、傍系親族(祖先の他の子)が描画から漏れる
 * (family-chart内部の`is_ancestry`フラグによる制約。setupSpouses等参照)。
 * 選択人物ではなくその最上位祖先をmain_idにすることで、この漏れを最小化する。
 * 親をたどる際は`findPrimaryParentFamily`と同じ優先順位(非実子を優先)を用いるため、
 * 養子縁組を含む人物を選択すると養親側の祖先へたどり着く(design.md D2)。
 */
export function findRootAncestor(
  doc: TreeDocument,
  personId: PersonId,
): PersonId {
  let current = personId
  const visited = new Set<PersonId>([current])
  for (;;) {
    const parentFamily = findPrimaryParentFamily(doc, current)
    const nextParent = parentFamily?.spouseIds[0]
    if (!nextParent || visited.has(nextParent)) return current
    visited.add(nextParent)
    current = nextParent
  }
}

/** 親子・配偶者関係を無向グラフとして表した隣接リストを構築する(全体表示モード・非表示人数バッジ共通) */
function buildAdjacency(doc: TreeDocument): Map<PersonId, Set<PersonId>> {
  const adjacency = new Map<PersonId, Set<PersonId>>()
  function link(a: PersonId, b: PersonId): void {
    if (!adjacency.has(a)) adjacency.set(a, new Set())
    if (!adjacency.has(b)) adjacency.set(b, new Set())
    adjacency.get(a)?.add(b)
    adjacency.get(b)?.add(a)
  }
  for (const family of Object.values(doc.families)) {
    for (let i = 0; i < family.spouseIds.length; i++) {
      for (let j = i + 1; j < family.spouseIds.length; j++) link(family.spouseIds[i], family.spouseIds[j])
    }
    for (const child of family.children) {
      for (const spouseId of family.spouseIds) link(spouseId, child.childId)
    }
  }
  return adjacency
}

/**
 * 全体表示モード(design.md D5)の根の計算専用に、各人物の「主たる子」(family-chartの
 * 子孫方向の走査が実際にたどる相手)と「配偶者」の一覧を構築する。
 */
function buildPrimaryChildrenAndSpouses(
  doc: TreeDocument,
): { primaryChildrenOf: Map<PersonId, PersonId[]>; spousesOf: Map<PersonId, PersonId[]> } {
  const primaryChildrenOf = new Map<PersonId, PersonId[]>()
  const spousesOf = new Map<PersonId, PersonId[]>()
  for (const family of Object.values(doc.families)) {
    for (const spouseId of family.spouseIds) {
      const others = family.spouseIds.filter((id) => id !== spouseId)
      if (others.length === 0) continue
      spousesOf.set(spouseId, [...(spousesOf.get(spouseId) ?? []), ...others])
    }
    for (const child of family.children) {
      if (findPrimaryParentFamily(doc, child.childId)?.id !== family.id) continue // 主たる家族のみ
      for (const spouseId of family.spouseIds) {
        primaryChildrenOf.set(spouseId, [...(primaryChildrenOf.get(spouseId) ?? []), child.childId])
      }
    }
  }
  return { primaryChildrenOf, spousesOf }
}

/**
 * 全体表示モード(design.md D5)用に、`TreeDocument` 内の全人物を漏れなく描画するために
 * 必要な「根」の集合を返す。
 *
 * family-chartは指定した`main_id`(=ここでは根1つ)から、(a) 血縁の祖先を`rels.parents`で
 * 再帰的にたどる祖先側と、(b) 血縁の子孫を`rels.children`で再帰的にたどる子孫側の木を作り、
 * その木に含まれる各人物の配偶者だけを1階層だけ横に添える(配偶者自身の祖先・傍系はさらに
 * たどらない。`setupSpouses`参照)。そのため、婚姻だけでつながった2つの血族(例: 夫の実家と
 * 妻の実家)は、単一の根からは「配偶者として存在は見えるが、その配偶者自身の実家は一切見えない」
 * 状態になる。この制約により、血縁でつながる範囲が互いに独立した「家系の始祖」(主たる親を
 * 持たない人物)ごとに、それぞれ別の根が必要になる(design.md D6のスパイクで確認した構造的制約)。
 *
 * アルゴリズム:
 * 1周目: 主たる子を1人以上持つ「始祖」(主たる親を持たない人物)を根候補とする。共同で子を
 *   もうけた配偶者同士(例: 両親2人)は主たる子の集合が完全に一致するため、家系図として
 *   同一の部分木を重複して描画してしまう。これを避けるため、子の集合が既出の組み合わせと
 *   完全一致する場合は2人目以降を根にしない(1人目のみ採用)。
 * 2周目: 子を持たない始祖(配偶者のみ、または係累の記録が無い孤立した人物)を扱う。1周目で
 *   選んだ根の実際の描画範囲(血縁の子孫+その配偶者)に既に含まれている場合は、その根の下に
 *   配偶者として自然に表示されるため、重複を避けて根にしない。含まれていない場合(孤立した
 *   人物、または配偶者もいない天涯孤独な人物)は、他のどの根からも描画されないため根にする。
 *
 * 戻り値の根の集合を仮想の「全体表示ルート」の子として与えることで、通常は1つの
 * `main_id`からは同時に到達できない複数の家系を1つの図にまとめて描画できる
 * (`toFullViewFamilyChartData`が生成する非主たる家族向けのスタブカードが、
 * 実子孫の連鎖的な重複なしに各根の下へその人物を再登場させる)。
 */
export function computeFullViewRoots(doc: TreeDocument): PersonId[] {
  const personIds = Object.keys(doc.persons)
  const hasPrimaryParent = new Set(personIds.filter((id) => findPrimaryParentFamily(doc, id) !== undefined))
  const { primaryChildrenOf, spousesOf } = buildPrimaryChildrenAndSpouses(doc)

  /** 根候補から実際に血縁でたどれる子孫と、その配偶者(1階層のみ)の集合。family-chartの実描画範囲に対応する */
  function reachableFrom(rootId: PersonId): Set<PersonId> {
    const reach = new Set<PersonId>()
    const queue = [rootId]
    while (queue.length > 0) {
      const current = queue.shift()
      if (current === undefined || reach.has(current)) continue
      reach.add(current)
      for (const child of primaryChildrenOf.get(current) ?? []) queue.push(child)
    }
    for (const id of [...reach]) {
      for (const spouseId of spousesOf.get(id) ?? []) reach.add(spouseId)
    }
    return reach
  }

  const roots: PersonId[] = []
  const covered = new Set<PersonId>()
  const seenChildrenKeys = new Set<string>()

  for (const id of personIds) {
    if (hasPrimaryParent.has(id)) continue
    const children = primaryChildrenOf.get(id)
    if (!children || children.length === 0) continue
    const key = [...new Set(children)].sort().join(',')
    if (seenChildrenKeys.has(key)) continue
    seenChildrenKeys.add(key)
    roots.push(id)
    for (const reachedId of reachableFrom(id)) covered.add(reachedId)
  }

  for (const id of personIds) {
    if (hasPrimaryParent.has(id) || covered.has(id)) continue
    roots.push(id)
    for (const reachedId of reachableFrom(id)) covered.add(reachedId)
  }

  return roots
}

/** 折りたたみ表示時の非表示人数バッジ1件分の情報(design.md D6) */
export interface HiddenNeighborInfo {
  /** 境界人物から辿れる非表示クラスタの人数 */
  count: number
  /** バッジをクリックした際に視点(main_id)を追従させる先の、直接の非表示隣接人物 */
  revealId: PersonId
}

/**
 * 折りたたみ表示時の非表示人数バッジ(design.md D6)。
 * `visibleIds`(現在family-chartが実際に描画している人物ID集合)に含まれない隣接人物を
 * 「境界」として検出し、境界ごとに非表示クラスタのサイズを幅優先探索で数える。
 * 同一の非表示クラスタが複数の境界から到達可能な場合は、`Object.keys(doc.persons)` の
 * 順で最初に見つかった境界にのみ計上する(二重計上を避ける)。
 * `revealId` はバッジをクリックして視点を追従させる先の人物(design.md リスク
 * 「養子縁組を持つ人物からもう一方の親族側へ戻れない」への対応)。
 * 戻り値は、非表示人物を1人以上持つ可視人物のIDから{count, revealId}へのMap。
 */
export function computeHiddenCounts(
  doc: TreeDocument,
  visibleIds: ReadonlySet<PersonId>,
): Map<PersonId, HiddenNeighborInfo> {
  const adjacency = buildAdjacency(doc)
  const countedHidden = new Set<PersonId>()
  const result = new Map<PersonId, HiddenNeighborInfo>()

  for (const personId of Object.keys(doc.persons)) {
    if (!visibleIds.has(personId)) continue
    let hiddenTotal = 0
    let revealId: PersonId | undefined
    for (const neighbor of adjacency.get(personId) ?? []) {
      if (visibleIds.has(neighbor) || countedHidden.has(neighbor)) continue
      if (revealId === undefined) revealId = neighbor
      countedHidden.add(neighbor)
      const cluster: PersonId[] = [neighbor]
      const queue = [neighbor]
      while (queue.length > 0) {
        const current = queue.shift()
        if (current === undefined) break
        for (const next of adjacency.get(current) ?? []) {
          if (visibleIds.has(next) || countedHidden.has(next)) continue
          countedHidden.add(next)
          cluster.push(next)
          queue.push(next)
        }
      }
      hiddenTotal += cluster.length
    }
    if (hiddenTotal > 0 && revealId !== undefined) result.set(personId, { count: hiddenTotal, revealId })
  }
  return result
}

/**
 * 親子ペア(parentId, childId)ごとの続柄を保持するマップを構築する(主たる親子線に限らず全家族分)。
 * family-chartは1人につき`rels.children`を通じて複数の家族の子を同時に把握しうるため
 * (例: 実親のfamilyにも養親のfamilyにも子として登録されている場合)、系線のスタイル分岐は
 * 人物単位の`pedigree`ではなく、実際に描画される辺(どの親とどの子を結ぶ線か)に対応する
 * この続柄を使わなければ、非主たる家族の辺が誤って主たる家族の続柄で描画されてしまう。
 */
export function buildPedigreeByEdge(doc: TreeDocument): Map<string, Pedigree> {
  const map = new Map<string, Pedigree>()
  for (const family of Object.values(doc.families)) {
    for (const child of family.children) {
      for (const spouseId of family.spouseIds) {
        map.set(`${spouseId}|${child.childId}`, child.pedigree)
      }
    }
  }
  return map
}

function ensureSet(map: Map<PersonId, Set<PersonId>>, id: PersonId): Set<PersonId> {
  let set = map.get(id)
  if (!set) {
    set = new Set()
    map.set(id, set)
  }
  return set
}

/**
 * 実在人物1人につき1件のカードデータを構築する共通処理。`toFamilyChartData`(折りたたみ表示。
 * 子は全所属家族分をchildrenSetsに含む「網羅的」モード)と`toFullViewFamilyChartData`の実カード部分
 * (全体表示。子は主たる家族のみをchildrenSetsに含む「主たる家族限定」モード)の両方で使う。
 *
 * `primaryOnly: true`の場合、ある家族が子の主たる家族でなければその親子関係はchildrenSets/
 * parentsByChild/pedigreeByChildのいずれにも反映しない(全体表示モードでは非主たる家族の子は
 * `toFullViewFamilyChartData`が別途生成するスタブカードとして表現するため)。
 */
function buildPersonDatums(doc: TreeDocument, options: { primaryOnly: boolean }): FamilyChartDatum[] {
  const spouseSets = new Map<PersonId, Set<PersonId>>()
  const childrenSets = new Map<PersonId, Set<PersonId>>()
  const parentsByChild = new Map<PersonId, PersonId[]>()
  const pedigreeByChild = new Map<PersonId, Pedigree>()

  for (const family of Object.values(doc.families)) {
    for (const spouseId of family.spouseIds) {
      const others = ensureSet(spouseSets, spouseId)
      for (const otherId of family.spouseIds) {
        if (otherId !== spouseId) others.add(otherId)
      }
    }

    for (const child of family.children) {
      const isPrimary = findPrimaryParentFamily(doc, child.childId)?.id === family.id
      if (options.primaryOnly) {
        if (!isPrimary) continue
        for (const spouseId of family.spouseIds) ensureSet(childrenSets, spouseId).add(child.childId)
        parentsByChild.set(child.childId, family.spouseIds)
        pedigreeByChild.set(child.childId, child.pedigree)
        continue
      }
      for (const spouseId of family.spouseIds) {
        ensureSet(childrenSets, spouseId).add(child.childId)
      }
      // 実子(biological)より非実子(養子・継子・里子・不明)を優先して主たる親子線として
      // 採用する(design.md D2)。実子は特筆すべき情報がないデフォルトの関係である一方、
      // 養子等は家系図上で明示的に伝えたい情報のため。同一人物が複数の非実子関係を持つ
      // (通常想定しない)場合は、出現順(Object.values(doc.families)の順)にフォールバックする
      const currentPedigree = pedigreeByChild.get(child.childId)
      if (currentPedigree === undefined || (currentPedigree === 'biological' && child.pedigree !== 'biological')) {
        parentsByChild.set(child.childId, family.spouseIds)
        pedigreeByChild.set(child.childId, child.pedigree)
      }
    }
  }

  return Object.values(doc.persons).map((person): FamilyChartDatum => {
    const parents = parentsByChild.get(person.id)
    const spouses = spouseSets.get(person.id)
    const children = childrenSets.get(person.id)
    return {
      id: person.id,
      data: {
        personId: person.id,
        gender: toGender(person.gender),
        displayName: displayName(person),
        surname: person.name.surname,
        given: person.name.given,
        birthYear: person.birth?.date?.date?.year,
        deathYear: person.death?.date?.date?.year,
        birthDate: person.birth?.date?.date,
        deathDate: person.death?.date?.date,
        age: computeAge(person),
        deceased: person.death !== undefined,
        pedigree: pedigreeByChild.get(person.id),
      },
      rels: {
        ...(parents && { parents }),
        ...(spouses && spouses.size > 0 && { spouses: [...spouses] }),
        ...(children && children.size > 0 && { children: [...children] }),
      },
    }
  })
}

export function toFamilyChartData(doc: TreeDocument): FamilyChartDatum[] {
  return buildPersonDatums(doc, { primaryOnly: false })
}

/** 全体表示モード専用の仮想ルートのID。実在の人物IDと衝突しない固定文字列を使う */
export const FULL_VIEW_ROOT_ID: PersonId = '__full-view-root__'

/** 非主たる家族向けのスタブカードのIDを生成する(実在人物IDおよび仮想ルートIDと衝突しない形式) */
function secondaryStubId(childId: PersonId, familyId: string): PersonId {
  return `${childId}__secondary__${familyId}`
}

/**
 * 全体表示モード(design.md D5)用のfamily-chartデータを構築する。
 *
 * 実カードは`buildPersonDatums(doc, {primaryOnly: true})`で構築し、各人物の`rels.children`には
 * 主たる家族の子のみを含める。これにより実子孫の連鎖(子・孫…)は主たる家族の経路でのみ辿られ、
 * 二重連結が起きない。
 *
 * 実親・養親のように複数の親家族を持つ人物(例: 夏目漱石)については、非主たる家族ごとに
 * 「スタブカード」(`rels`が空の、その人物の表示用複製)を追加で生成し、非主たる家族の配偶者
 * (=もう一方の親)の`rels.children`にはこのスタブカードのIDを追加する。スタブカードは`rels`が
 * 空のため、family-chartはスタブからその先(子孫)を辿らない。よって「実子孫の連鎖的重複」を
 * 起こさずに、その人物自身だけをもう一方の家系の下にも登場させられる
 * (`personIdOf`はカード内部の`data.personId`を見るため、スタブは元人物と同じ人物として扱われる)。
 *
 * `computeFullViewRoots`が返す全ての根(主たる家族のみで連結成分を求めた場合の各成分の代表者)を
 * 子に持つ仮想ルート(`FULL_VIEW_ROOT_ID`)を1件追加する。これを`main_id`に指定すると、
 * family-chartは仮想ルートの子孫として全ての根を辿るため、通常は単一のmain_idからは同時に
 * 到達できない複数の家系を1つの図にまとめて描画できる。仮想ルート自身のカード・系線は
 * `FamilyTreeCanvas`側で非表示にする。
 */
export function toFullViewFamilyChartData(doc: TreeDocument): FamilyChartDatum[] {
  const persons = buildPersonDatums(doc, { primaryOnly: true })
  const byId = new Map(persons.map((d) => [d.id, d]))

  const stubs: FamilyChartDatum[] = []
  for (const family of Object.values(doc.families)) {
    for (const child of family.children) {
      if (findPrimaryParentFamily(doc, child.childId)?.id === family.id) continue // 主たる家族は上で反映済み
      const childDatum = byId.get(child.childId)
      if (!childDatum) continue
      const id = secondaryStubId(child.childId, family.id)
      stubs.push({
        id,
        data: { ...childDatum.data, pedigree: child.pedigree },
        rels: {},
      })
      for (const spouseId of family.spouseIds) {
        const parentDatum = byId.get(spouseId)
        if (!parentDatum) continue
        parentDatum.rels.children = [...(parentDatum.rels.children ?? []), id]
      }
    }
  }

  const roots = computeFullViewRoots(doc)
  if (roots.length === 0) return persons
  const virtualRoot: FamilyChartDatum = {
    id: FULL_VIEW_ROOT_ID,
    data: { personId: FULL_VIEW_ROOT_ID, gender: 'U', displayName: '', deceased: false },
    rels: { children: roots },
  }
  return [...persons, ...stubs, virtualRoot]
}

/**
 * 子の並び順比較関数(design.md D1)。family-chartの`setSortChildrenFunction`に渡す。
 * 生年が判明している子は生年昇順、不明な子はその後ろに名前順で並べる。
 *
 * family-chartは指定した比較関数の適用後に内部関数`sortChildrenWithSpouses`を必ず実行し、
 * 親カードの性別(`data.gender === 'M'`かどうか)で昇順/降順を反転させる。単婚(半きょうだいが
 * いない)の子リストでは比較キーが全員同値になり安定ソートでこの並び順が維持されるが、
 * 複数婚で半きょうだいが混在する場合は婚姻単位の再グルーピングが優先される(design.md D1参照)。
 */
export function compareChildrenByBirthThenName(a: FamilyChartDatum, b: FamilyChartDatum): number {
  const yearA = a.data.birthYear
  const yearB = b.data.birthYear
  if (yearA !== undefined && yearB !== undefined) return yearA - yearB
  if (yearA !== undefined) return -1
  if (yearB !== undefined) return 1
  return a.data.displayName.localeCompare(b.data.displayName, 'ja')
}

/** personIdとspouseIdの間で最初に成立した婚姻イベントの年を返す(復縁がある場合は最初の婚姻年) */
function marriageYear(doc: TreeDocument, personId: PersonId, spouseId: PersonId): number | undefined {
  const family = Object.values(doc.families).find(
    (f) => f.spouseIds.includes(personId) && f.spouseIds.includes(spouseId),
  )
  const marriage = family?.events.find((e) => e.type === 'marriage')
  return marriage?.date?.date?.year
}

/**
 * 配偶者の並び順(design.md D1)。family-chartの`setSortSpousesFunction`に渡す。
 * 婚姻イベント日付が判明している婚姻を日付昇順に、不明な婚姻は元の登録順を維持したまま並べる。
 * family-chartの仕様上、この関数は`datum.rels.spouses`を破壊的に(in-place で)並べ替える。
 */
export function sortSpousesByMarriageDate(doc: TreeDocument, datum: FamilyChartDatum): void {
  const spouses = datum.rels.spouses
  if (!spouses) return
  spouses.sort((a, b) => {
    const yearA = marriageYear(doc, datum.id, a)
    const yearB = marriageYear(doc, datum.id, b)
    if (yearA !== undefined && yearB !== undefined) return yearA - yearB
    if (yearA !== undefined) return -1
    if (yearB !== undefined) return 1
    return 0
  })
}

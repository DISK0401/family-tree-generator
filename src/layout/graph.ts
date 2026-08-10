import { displayName } from '../domain/helpers'
import type {
  FamilyId,
  Pedigree,
  PersonId,
  TreeDocument,
} from '../domain/types'

/**
 * 「家族(婚姻単位)を結合点とするグラフ」(design.md D1)。
 * `TreeDocument`の`Record`(オブジェクト)をそのまま使わず、レイアウタ内部では
 * `Map`で持つ。反復順序を`Object.values()`の列挙に委ねないためで、以降の各段
 * (generations.ts / ordering.ts / coordinates.ts)は必ずキーをソートしてから走査する(D5)。
 */

/**
 * グラフ上の人物ノード。基本は「どの家族に配偶者・子として属するか」という構造情報のみを持つ。
 * `birthOrder`/`birthYear`/`displayName`は例外で、兄弟の並び順比較(design.md D3/D4)に
 * 必要な最小限のPerson属性だけを派生値として持たせてある
 */
export interface PersonNode {
  id: PersonId
  /** 配偶者として属する家族のID */
  spouseFamilyIds: FamilyId[]
  /** 子として属する家族のID。実親・養親の双方を持つ人物は複数件になる */
  parentFamilyIds: FamilyId[]
  /** 家族内での出生順(性別非依存)。兄弟の並び順比較に使う(design.md D1/D3) */
  birthOrder?: number
  /** 生年(西暦)。出生順が未設定の兄弟どうしの並び順比較に使う */
  birthYear?: number
  /** 表示名。出生順・生年のいずれも不明な兄弟どうしの並び順比較に使う */
  displayName: string
}

/** グラフ上の家族(結合点)ノード。存在しない人物への参照は構築時に除いてある */
export interface FamilyNode {
  id: FamilyId
  spouseIds: PersonId[]
  children: { childId: PersonId; pedigree: Pedigree }[]
}

export interface PedigreeGraph {
  persons: Map<PersonId, PersonNode>
  families: Map<FamilyId, FamilyNode>
}

/**
 * `TreeDocument`からレイアウト用のグラフを構築する。
 *
 * 存在しない人物IDを指す配偶者参照・子リンクは無視する(spec「不整合なデータに対する頑健性」)。
 * GEDCOMインポート由来のデータは読み込み時に自動修正しない方針のため、こうした欠損参照は
 * ドメイン層のガードをすり抜けて残りうる。レイアウタ側で握りつぶし、残りの人物・関係だけで
 * 描画を続けられるようにする。
 *
 * 配偶者・子のいずれも実在しない家族(欠損参照だけの家族)は骨格に寄与しないため取り除く。
 */
export function buildGraph(doc: TreeDocument): PedigreeGraph {
  const persons = new Map<PersonId, PersonNode>()
  for (const id of Object.keys(doc.persons)) {
    const person = doc.persons[id]
    persons.set(id, {
      id,
      spouseFamilyIds: [],
      parentFamilyIds: [],
      birthOrder: person.birthOrder,
      birthYear: person.birth?.date?.date?.year,
      displayName: displayName(person),
    })
  }

  const families = new Map<FamilyId, FamilyNode>()
  for (const familyId of Object.keys(doc.families).sort()) {
    const family = doc.families[familyId]
    // 同一人物への重複参照(spouseIdsに同じIDが2回、childrenに同じ子が2件等)は最初の1件だけを
    // 採用する。欠損参照の握りつぶしと同じ「レイアウタ側の頑健性」であり、重複を残すと
    // 同一人物が2枚のカードとして配置され、spec「同一人物を複製しない配置」に反する
    const spouseIds = [...new Set(family.spouseIds)].filter((id) =>
      persons.has(id),
    )
    const seenChildIds = new Set<PersonId>()
    const children: FamilyNode['children'] = []
    for (const c of family.children) {
      if (!persons.has(c.childId) || seenChildIds.has(c.childId)) continue
      seenChildIds.add(c.childId)
      children.push({ childId: c.childId, pedigree: c.pedigree })
    }
    if (spouseIds.length === 0 && children.length === 0) continue

    families.set(familyId, { id: familyId, spouseIds, children })
    for (const spouseId of spouseIds)
      persons.get(spouseId)?.spouseFamilyIds.push(familyId)
    for (const child of children)
      persons.get(child.childId)?.parentFamilyIds.push(familyId)
  }

  return { persons, families }
}

/**
 * 互いに関係を持たない集団(連結成分)へグラフを分割する(spec「連結していない範囲の配置」)。
 * 人物どうしは「同じ家族に配偶者または子として属する」ことで連結する。
 *
 * 各成分は独立にレイアウトし(generations→ordering→coordinates)、後段(index.ts)で横に
 * 並べて結合する(design.md D2-3)。成分どうしの並び順は、成分内の最小人物IDで決める
 * (D5: 列挙順ではなく全順序で決定する)。
 */
export function splitIntoComponents(graph: PedigreeGraph): PedigreeGraph[] {
  const visited = new Set<PersonId>()
  const rawComponents: {
    personIds: Set<PersonId>
    familyIds: Set<FamilyId>
  }[] = []

  for (const startId of [...graph.persons.keys()].sort()) {
    if (visited.has(startId)) continue
    const personIds = new Set<PersonId>()
    const familyIds = new Set<FamilyId>()
    const queue: PersonId[] = [startId]
    visited.add(startId)

    // shift()は先頭削除のたびに残り全要素を詰め直すため、大きな成分でO(n^2)になる。
    // 読み取り位置を前進させるだけにして、配列は伸びる一方で使う
    for (let head = 0; head < queue.length; head++) {
      const current = queue[head]
      personIds.add(current)
      const node = graph.persons.get(current)
      if (!node) continue
      for (const familyId of [
        ...node.spouseFamilyIds,
        ...node.parentFamilyIds,
      ]) {
        if (familyIds.has(familyId)) continue
        familyIds.add(familyId)
        const family = graph.families.get(familyId)
        if (!family) continue
        const relatedIds = [
          ...family.spouseIds,
          ...family.children.map((c) => c.childId),
        ]
        for (const relatedId of relatedIds) {
          if (visited.has(relatedId)) continue
          visited.add(relatedId)
          queue.push(relatedId)
        }
      }
    }

    rawComponents.push({ personIds, familyIds })
  }

  rawComponents.sort((a, b) =>
    minId(a.personIds).localeCompare(minId(b.personIds)),
  )

  return rawComponents.map(({ personIds, familyIds }) => {
    const persons = new Map<PersonId, PersonNode>()
    for (const id of personIds) {
      const node = graph.persons.get(id)
      if (node) persons.set(id, node)
    }
    const families = new Map<FamilyId, FamilyNode>()
    for (const id of familyIds) {
      const node = graph.families.get(id)
      if (node) families.set(id, node)
    }
    return { persons, families }
  })
}

function minId(ids: Set<PersonId>): PersonId {
  return [...ids].sort()[0] ?? ''
}

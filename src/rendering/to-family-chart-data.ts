import { displayName } from '../domain/helpers'
import type { Pedigree, Person, PersonId, TreeDocument } from '../domain/types'

/**
 * TreeDocument → family-chart描画用データへの変換アダプタ。
 *
 * ドメインモデル(TreeDocument)を唯一の真実とし、family-chartの`Data`形式は
 * 描画直前にこの関数で射影するだけの使い捨てとする(design.md D1)。
 * family-chartのData形式に保存・編集を行わせてはならない。
 *
 * 既知の制約: family-chartの各人物は`rels.parents`を1組(最大2人)しか持てないため、
 * 同一人物が複数の家族に「子」として属する場合(実親+養親の両方など)、
 * 描画上の主たる親子線は最初に見つかった家族(Object.values(doc.families)の順)を採用する。
 * これはfamily-chart側の表現力の限界であり、データモデル自体は複数所属を保持し続ける
 * (design.md リスク「family-chartの表現力限界」参照)。
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
  /** この人物の主たる親子線(rels.parents)に対応する続柄種別。線のスタイル分岐(6.4)に使う */
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

export function toFamilyChartData(doc: TreeDocument): FamilyChartDatum[] {
  const spouseSets = new Map<PersonId, Set<PersonId>>()
  const childrenSets = new Map<PersonId, Set<PersonId>>()
  const parentsByChild = new Map<PersonId, PersonId[]>()
  const pedigreeByChild = new Map<PersonId, Pedigree>()

  function ensureSet(map: Map<PersonId, Set<PersonId>>, id: PersonId): Set<PersonId> {
    let set = map.get(id)
    if (!set) {
      set = new Set()
      map.set(id, set)
    }
    return set
  }

  for (const family of Object.values(doc.families)) {
    for (const spouseId of family.spouseIds) {
      const others = ensureSet(spouseSets, spouseId)
      for (const otherId of family.spouseIds) {
        if (otherId !== spouseId) others.add(otherId)
      }
    }

    for (const child of family.children) {
      for (const spouseId of family.spouseIds) {
        ensureSet(childrenSets, spouseId).add(child.childId)
      }
      // 最初に見つかった家族を主たる親子線として採用する(上記コメント参照)
      if (!parentsByChild.has(child.childId)) {
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

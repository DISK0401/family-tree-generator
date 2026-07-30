import type { PersonId } from '../domain/types'
import type { PedigreeGraph } from './graph'

/**
 * 世代割り当ての反復回数の上限(design.md D6)。
 * GEDCOMインポート由来などで世代方向の循環を含むデータ(spec「不整合なデータに対する頑健性」)
 * では下の緩和が収束しないため、有限回で打ち切ってその時点の割り当てを返す。
 *
 * 上限は人数から導く。循環が無ければ、ある人物の層は「その人物へ至る最長の親子の連なり」で
 * 決まり、その長さは人数を超えない。したがって人数+2回で必ず収束する(+1は伝播の余裕、
 * +1は「変化しなかった」ことを検出する回)。
 *
 * 固定の大きな上限(例: 1000)にしないのは、打ち切ったときの層数がそのまま図の高さになるため。
 * 2人だけの循環データでも上限まで層が増え続け、カード2枚のために数十万pxの図ができてしまう。
 * 人数から導けば、壊れたデータでも図の高さは人数ぶんの層に収まる
 */
function maxIterations(personCount: number): number {
  return personCount + 2
}

export interface GenerationAssignment {
  generationOf: Map<PersonId, number>
  /** 上限に達する前に安定したか。循環データの診断・テストに使う */
  converged: boolean
}

/**
 * 反復緩和による世代割り当て(design.md D2-1)。
 *
 * ```
 * 全員を層0に置く
 * 安定するまで繰り返す:
 *   各家族について: 子の層 = max(子の層, 配偶者たちの層の最大 + 1)
 *   各家族について: 配偶者たちの層 = 配偶者たちの層の最大(夫婦を同じ層へ揃える)
 * ```
 *
 * 子の層は「親より下」という下限だけを課し、上限は課さない。そのため、配偶者の一方が
 * 引き上げられて2層以上離れた婚姻になっても(世代の離れた婚姻)、次の反復でその子の層も
 * 追従して上がるだけで、失敗にはならない(spec「世代の離れた婚姻」)。
 *
 * 家族の走査順は家族IDの昇順に固定する。`Object.values()`の列挙順(実行のたびに変わりうる)
 * に依存すると、同一世代内での更新順序が変わり、収束前の中間状態や打ち切り時の結果が
 * 実行ごとに揺れかねないため(spec「レイアウトの決定性」)
 */
export function assignGenerations(graph: PedigreeGraph): GenerationAssignment {
  const generationOf = new Map<PersonId, number>()
  for (const id of [...graph.persons.keys()].sort()) generationOf.set(id, 0)

  const familyIds = [...graph.families.keys()].sort()
  const limit = maxIterations(graph.persons.size)
  let converged = false

  for (let iteration = 0; iteration < limit; iteration++) {
    let changed = false

    for (const familyId of familyIds) {
      const family = graph.families.get(familyId)
      if (!family || family.spouseIds.length === 0) continue
      const spouseMax = Math.max(
        ...family.spouseIds.map((id) => generationOf.get(id) ?? 0),
      )
      for (const child of family.children) {
        const required = spouseMax + 1
        const current = generationOf.get(child.childId) ?? 0
        if (current < required) {
          generationOf.set(child.childId, required)
          changed = true
        }
      }
    }

    for (const familyId of familyIds) {
      const family = graph.families.get(familyId)
      if (!family || family.spouseIds.length < 2) continue
      const max = Math.max(
        ...family.spouseIds.map((id) => generationOf.get(id) ?? 0),
      )
      for (const spouseId of family.spouseIds) {
        const current = generationOf.get(spouseId) ?? 0
        if (current < max) {
          generationOf.set(spouseId, max)
          changed = true
        }
      }
    }

    if (!changed) {
      converged = true
      break
    }
  }

  return { generationOf, converged }
}

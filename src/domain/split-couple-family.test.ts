import { describe, expect, it } from 'vitest'
import { addChild, addPerson, addSpouse, linkChild, linkParent, linkSpouse } from './commands'
import { createTreeDocument } from './helpers'
import type { PersonId, TreeDocument } from './types'
import { toFamilyChartData } from '../rendering/to-family-chart-data'

/**
 * 報告された不具合の再現と修復の検証。
 *
 * 「富岡徳雄・ぎんの子であるはずの 榮 が徳雄からのみ系線が伸びる」「齋藤兎一・富岡榮の子が
 * すべて兎一からのみ伸びる」という2件は、いずれも描画ではなくデータが原因で、夫婦の子が
 * 片方の親だけを配偶者とする家族に記録されていた(proposal.md)。
 * 既に保存されたドキュメントは読み込み時に自動修復しない方針(`fix-spouseless-family-handling`
 * design.md D3)のため、利用者が「親を追加」で直せることまでを検証する。
 */

/** 描画データ上、その人物の親として描かれる人数 */
function drawnParentCount(doc: TreeDocument, personId: PersonId): number {
  const datum = toFamilyChartData(doc).find((d) => d.id === personId)
  return datum?.rels.parents?.length ?? 0
}

describe('夫婦の子が片方の親だけの子として記録される不具合', () => {
  /**
   * 報告データの兎一と同じ形。婚姻(榮)に加えて、旧バージョンが残した空き殻
   * (配偶者1件・子0件)を持つ
   */
  function taichiWithShell() {
    let doc = createTreeDocument()
    const taichi = addPerson(doc, { name: { surname: '齋藤', given: '兎一' } })
    doc = taichi.doc
    const sakae = addPerson(doc, { name: { surname: '富岡', given: '榮' } })
    doc = sakae.doc
    doc = {
      ...doc,
      families: {
        ...doc.families,
        shell: { id: 'shell', spouseIds: [taichi.personId], kind: 'unknown', events: [], children: [] },
      },
    }
    const marriage = linkSpouse(doc, sakae.personId, taichi.personId)
    return { doc: marriage.doc, taichiId: taichi.personId, sakaeId: sakae.personId, marriageId: marriage.familyId }
  }

  it('空き殻が残っていても、「親を追加」した子は夫婦の家族へ入る', () => {
    const { doc: initial, taichiId, sakaeId, marriageId } = taichiWithShell()
    let doc = initial
    const childIds: PersonId[] = []

    for (const given of ['紀佳', '洋公', '英子']) {
      const child = addPerson(doc, { name: { surname: '富岡', given } })
      doc = linkParent(child.doc, child.personId, taichiId).doc
      childIds.push(child.personId)
    }

    // 3人とも1つの夫婦の家族に属し、配偶者不在の家族が量産されない
    expect(doc.families[marriageId].children.map((c) => c.childId)).toEqual(childIds)
    expect(Object.values(doc.families).filter((f) => f.children.length > 0)).toHaveLength(1)
    for (const childId of childIds) {
      expect(drawnParentCount(doc, childId)).toBe(2)
      expect(doc.families[marriageId].spouseIds).toEqual([sakaeId, taichiId])
    }
  })

  it('既に分裂して保存された家系図を「親を追加」で修復できる', () => {
    // 報告データ相当: 徳雄のみを配偶者とする家族に 榮 が、徳雄・ぎんの家族に 兎一 が記録されている
    let doc = createTreeDocument()
    const tokuo = addPerson(doc, { name: { surname: '富岡', given: '徳雄' } })
    doc = tokuo.doc
    const sakae = addChild(doc, tokuo.personId, { name: { surname: '富岡', given: '榮' } })
    doc = sakae.doc
    const gin = addSpouse(doc, tokuo.personId, { name: { surname: '富岡', given: 'ぎん' } })
    doc = gin.doc
    const taichi = addPerson(doc, { name: { surname: '齋藤', given: '兎一' } })
    doc = linkChild(taichi.doc, tokuo.personId, taichi.personId, {
      otherParentId: gin.spouseId,
    }).doc

    // 修復前: 榮 の親は徳雄1人だけとして描かれる
    expect(drawnParentCount(doc, sakae.childId)).toBe(1)
    expect(Object.values(doc.families).filter((f) => f.spouseIds.includes(tokuo.personId))).toHaveLength(2)

    // 榮 に「親を追加」で ぎん を紐づける
    const repaired = linkParent(doc, sakae.childId, gin.spouseId)

    expect(repaired.familyId).toBe(gin.familyId)
    expect(drawnParentCount(repaired.doc, sakae.childId)).toBe(2)
    expect(repaired.doc.families[gin.familyId].children.map((c) => c.childId).sort()).toEqual(
      [sakae.childId, taichi.personId].sort(),
    )
    // 徳雄・ぎんの家族は1件へ統合され、榮 と 兎一 が同じ夫婦の子になる
    expect(
      Object.values(repaired.doc.families).filter((f) => f.spouseIds.includes(tokuo.personId)),
    ).toHaveLength(1)
  })
})

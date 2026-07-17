import { describe, expect, it } from 'vitest'
import { createId } from './id'
import { personSchema } from './person'
import { familySchema } from './family'
import {
  familyTreeDataSchema,
  validateReferentialIntegrity,
  createEmptyFamilyTreeData,
} from './model'

function person(
  overrides: Partial<Parameters<typeof personSchema.parse>[0]> = {},
) {
  return personSchema.parse({ id: createId(), ...overrides })
}

describe('Person / Family バリデーション', () => {
  it('氏名のみで生没年・性別が不明な人物を登録できる', () => {
    const p = person({ name: { family: '山田', given: '太郎' } })

    expect(p.gender).toBeUndefined()
    expect(p.birth).toBeUndefined()
  })

  it('再婚(同一人物が2つの家族にパートナーとして所属)を表現できる', () => {
    const a = person()
    const b = person()
    const c = person()

    const familyAB = familySchema.parse({
      id: createId(),
      partnerIds: [a.id, b.id],
      relationshipType: 'divorced',
      children: [],
    })
    const familyAC = familySchema.parse({
      id: createId(),
      partnerIds: [a.id, c.id],
      relationshipType: 'marriage',
      children: [],
    })

    const data = familyTreeDataSchema.parse({
      people: [a, b, c],
      families: [familyAB, familyAC],
    })

    const familiesWithA = data.families.filter((f) =>
      f.partnerIds.includes(a.id),
    )
    expect(familiesWithA).toHaveLength(2)
  })

  it('養子縁組で実親家族に実子・養親家族に養子として二重所属できる', () => {
    const child = person()
    const biologicalParent = person()
    const adoptiveParent = person()

    const biologicalFamily = familySchema.parse({
      id: createId(),
      partnerIds: [biologicalParent.id],
      children: [{ personId: child.id, pedigree: 'biological' }],
    })
    const adoptiveFamily = familySchema.parse({
      id: createId(),
      partnerIds: [adoptiveParent.id],
      children: [{ personId: child.id, pedigree: 'adopted' }],
    })

    const data = familyTreeDataSchema.parse({
      people: [child, biologicalParent, adoptiveParent],
      families: [biologicalFamily, adoptiveFamily],
    })

    const pedigrees = data.families
      .flatMap((f) => f.children)
      .filter((c) => c.personId === child.id)
      .map((c) => c.pedigree)

    expect(pedigrees).toEqual(expect.arrayContaining(['biological', 'adopted']))
  })

  it('片親のみ判明している家族を登録できる', () => {
    const mother = person()
    const child = person()

    const family = familySchema.parse({
      id: createId(),
      partnerIds: [mother.id],
      children: [{ personId: child.id, pedigree: 'biological' }],
    })

    expect(family.partnerIds).toHaveLength(1)
  })
})

describe('validateReferentialIntegrity', () => {
  it('存在しない人物IDへの参照を整合性エラーとして検出する', () => {
    const existing = person()
    const family = familySchema.parse({
      id: 'f-1',
      partnerIds: [existing.id],
      children: [{ personId: 'p-999', pedigree: 'biological' }],
    })

    const issues = validateReferentialIntegrity({
      people: [existing],
      families: [family],
    })

    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      familyId: 'f-1',
      personId: 'p-999',
      role: 'child',
    })
  })

  it('すべての参照が解決できる場合はエラーなしで成功する', () => {
    const a = person()
    const b = person()
    const family = familySchema.parse({
      id: 'f-1',
      partnerIds: [a.id, b.id],
      children: [],
    })

    const issues = validateReferentialIntegrity({
      people: [a, b],
      families: [family],
    })

    expect(issues).toHaveLength(0)
  })

  it('空のデータモデルはエラーなしで検証できる', () => {
    const issues = validateReferentialIntegrity(createEmptyFamilyTreeData())
    expect(issues).toHaveLength(0)
  })
})

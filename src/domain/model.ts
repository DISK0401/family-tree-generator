import { z } from 'zod'
import { personSchema, type Person } from './person'
import { familySchema, type Family } from './family'

export const familyTreeDataSchema = z.object({
  people: z.array(personSchema),
  families: z.array(familySchema),
})
export type FamilyTreeData = z.infer<typeof familyTreeDataSchema>

export interface IntegrityIssue {
  /** 問題の原因となった家族のID */
  familyId: string
  /** 存在しない人物ID */
  personId: string
  /** その人物IDがどの役割で参照されていたか */
  role: 'partner' | 'child'
}

/**
 * データモデル全体の参照整合性を検証する。
 * Family が参照する人物IDのうち、people に存在しないものを列挙する。
 */
export function validateReferentialIntegrity(
  data: FamilyTreeData,
): IntegrityIssue[] {
  const personIds = new Set(data.people.map((person) => person.id))
  const issues: IntegrityIssue[] = []

  for (const family of data.families) {
    for (const partnerId of family.partnerIds) {
      if (!personIds.has(partnerId)) {
        issues.push({
          familyId: family.id,
          personId: partnerId,
          role: 'partner',
        })
      }
    }
    for (const child of family.children) {
      if (!personIds.has(child.personId)) {
        issues.push({
          familyId: family.id,
          personId: child.personId,
          role: 'child',
        })
      }
    }
  }

  return issues
}

export function createEmptyFamilyTreeData(): FamilyTreeData {
  return { people: [], families: [] }
}

export type { Person, Family }

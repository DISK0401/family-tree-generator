import { z } from 'zod'

/**
 * TreeDocument(src/domain/types.ts)を検証するzodスキーマ。
 * 型定義自体は family-data-model ケーパビリティが正本のため、ここでは
 * 実行時バリデーション用にフィールド形状を写す。
 */
export const genderSchema = z.enum(['male', 'female', 'unknown'])

export const personNameSchema = z.object({
  surname: z.string().optional(),
  given: z.string().optional(),
  surnameKana: z.string().optional(),
  givenKana: z.string().optional(),
})

export const dateQualifierSchema = z.enum([
  'exact',
  'about',
  'before',
  'after',
  'between',
])

export const calendarDateSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12).optional(),
  day: z.number().int().min(1).max(31).optional(),
})

export const fuzzyDateSchema = z.object({
  original: z.string(),
  qualifier: dateQualifierSchema,
  date: calendarDateSchema.optional(),
  date2: calendarDateSchema.optional(),
})

function lifeEventSchema<T extends z.ZodTypeAny>(typeSchema: T) {
  return z.object({
    type: typeSchema,
    date: fuzzyDateSchema.optional(),
    place: z.string().optional(),
  })
}

export const personSchema = z.object({
  id: z.string(),
  name: personNameSchema,
  gender: genderSchema,
  birth: lifeEventSchema(z.literal('birth')).optional(),
  death: lifeEventSchema(z.literal('death')).optional(),
  note: z.string().optional(),
})

export const pedigreeSchema = z.enum([
  'biological',
  'adopted',
  'step',
  'foster',
  'unknown',
])

export const childLinkSchema = z.object({
  childId: z.string(),
  pedigree: pedigreeSchema,
})

export const familyKindSchema = z.enum(['married', 'common-law', 'unknown'])

export const familySchema = z.object({
  id: z.string(),
  spouseIds: z.array(z.string()),
  kind: familyKindSchema,
  events: z.array(lifeEventSchema(z.enum(['marriage', 'divorce']))),
  children: z.array(childLinkSchema),
})

export const treeDocumentSchema = z.object({
  schemaVersion: z.number().int(),
  id: z.string(),
  title: z.string(),
  updatedAt: z.string(),
  persons: z.record(z.string(), personSchema),
  families: z.record(z.string(), familySchema),
})

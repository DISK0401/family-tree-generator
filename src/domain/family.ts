import { z } from 'zod'
import { lifeDateSchema } from './date'
import { gedcomNodeSchema } from './gedcomNode'

export const familyRelationshipTypeSchema = z.enum([
  'marriage',
  'defacto',
  'divorced',
  'annulled',
  'unknown',
])
export type FamilyRelationshipType = z.infer<
  typeof familyRelationshipTypeSchema
>

export const childPedigreeSchema = z.enum([
  'biological',
  'adopted',
  'step',
  'foster',
])
export type ChildPedigree = z.infer<typeof childPedigreeSchema>

export const childLinkSchema = z.object({
  personId: z.string(),
  pedigree: childPedigreeSchema,
})
export type ChildLink = z.infer<typeof childLinkSchema>

/**
 * 家族(結合単位)。パートナーは0〜複数名を許容する配列で表現する
 * (片親のみの家族は1名、複数配偶者は複数のFamilyレコードで表現する)。
 */
export const familySchema = z.object({
  id: z.string(),
  partnerIds: z.array(z.string()),
  relationshipType: familyRelationshipTypeSchema.optional(),
  marriageDate: lifeDateSchema.optional(),
  marriagePlace: z.string().optional(),
  divorceDate: lifeDateSchema.optional(),
  children: z.array(childLinkSchema),
  note: z.string().optional(),
  /** インポート時に意味を解釈しなかったGEDCOMタグの保全領域 */
  unmappedTags: z.array(gedcomNodeSchema).optional(),
})
export type Family = z.infer<typeof familySchema>

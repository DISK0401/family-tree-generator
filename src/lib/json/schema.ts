import { z } from 'zod'
import { personSchema } from '../../domain/person'
import { familySchema } from '../../domain/family'

export const CURRENT_SCHEMA_VERSION = 1

/**
 * アプリネイティブのJSON形式(v1)。内部データモデルをそのまま直列化し、
 * GEDCOMでは表現しきれない情報を含めロスレスにバックアップ・復元する。
 */
export const familyTreeExportSchemaV1 = z.object({
  schemaVersion: z.literal(1),
  exportedAt: z.string(),
  people: z.array(personSchema),
  families: z.array(familySchema),
})
export type FamilyTreeExportV1 = z.infer<typeof familyTreeExportSchemaV1>

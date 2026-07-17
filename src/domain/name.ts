import { z } from 'zod'

export const kanaNameSchema = z.object({
  family: z.string().optional(),
  given: z.string().optional(),
})
export type KanaName = z.infer<typeof kanaNameSchema>

/**
 * 氏名の複合表現。旧字体・異体字は入力された文字をそのまま保持し、
 * 新字体への置換や正規化は行わない。別表記(旧字体/新字体等)は alternates に格納する。
 */
export interface PersonName {
  family?: string
  given?: string
  kana?: KanaName
  romanized?: string
  alternates?: PersonName[]
}

export const personNameSchema: z.ZodType<PersonName> = z.lazy(() =>
  z.object({
    family: z.string().optional(),
    given: z.string().optional(),
    kana: kanaNameSchema.optional(),
    romanized: z.string().optional(),
    alternates: z.array(personNameSchema).optional(),
  }),
)

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

/**
 * 実在日の検証。src/domain/calendar-date.ts の isValidDateForYear と同等のロジックを
 * スキーマ側にも適用する(2/31のような存在しない日付を拒否。うるう年を考慮)。
 * 明治6年(1873年)のグレゴリオ暦採用より前は旧暦の日付のため、和暦入力の緩い受理
 * (日は1〜30)と同じ基準で検証する。厳密にするとエクスポート済みの旧暦日付
 * (例: 安政3年2月30日 → 1856-02-30)が再インポートできなくなる。
 */
function isValidCalendarDate(
  year: number,
  month?: number,
  day?: number,
): boolean {
  if (month === undefined) return true
  if (month < 1 || month > 12) return false
  if (day === undefined) return true
  if (year < 1873) return day >= 1 && day <= 30
  const daysInMonth = new Date(year, month, 0).getDate()
  return day >= 1 && day <= daysInMonth
}

export const calendarDateSchema = z
  .object({
    year: z.number().int(),
    month: z.number().int().min(1).max(12).optional(),
    day: z.number().int().min(1).max(31).optional(),
  })
  .superRefine((date, ctx) => {
    if (!isValidCalendarDate(date.year, date.month, date.day)) {
      ctx.addIssue({
        code: 'custom',
        path: ['day'],
        message: `存在しない日付です(${date.year}年${date.month ?? '?'}月${date.day ?? '?'}日)`,
      })
    }
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
  birthOrder: z.number().optional(),
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

export const treeDocumentSchema = z
  .object({
    schemaVersion: z.number().int(),
    id: z.string(),
    title: z.string(),
    updatedAt: z.string(),
    persons: z.record(z.string(), personSchema),
    families: z.record(z.string(), familySchema),
  })
  .superRefine((doc, ctx) => {
    // ドキュメントレベル検証: レコードキーと各idの一致。
    // キー≠idはID参照の前提そのものが崩れており修復不能なためエラーで拒否する。
    // 一方、参照切れ・重複(spouseIds / children[].childId)は過去のエクスポート
    // (ダングリングを含み得る)を救うためスキーマエラーにせず、インポート側
    // (import.ts)で警告付き修復する。
    for (const [key, person] of Object.entries(doc.persons)) {
      if (person.id !== key) {
        ctx.addIssue({
          code: 'custom',
          path: ['persons', key, 'id'],
          message: `personsのキー(${key})とid(${person.id})が一致しません`,
        })
      }
    }
    for (const [key, family] of Object.entries(doc.families)) {
      if (family.id !== key) {
        ctx.addIssue({
          code: 'custom',
          path: ['families', key, 'id'],
          message: `familiesのキー(${key})とid(${family.id})が一致しません`,
        })
      }
    }
  })

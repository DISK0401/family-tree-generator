import { z } from 'zod'

export const calendarSchema = z.enum(['gregorian', 'japanese'])
export type Calendar = z.infer<typeof calendarSchema>

export const dateQualifierSchema = z.enum([
  'about',
  'before',
  'after',
  'estimated',
])
export type DateQualifier = z.infer<typeof dateQualifierSchema>

/**
 * 家系図の日付表現。入力原文(original)を必ず保持し、
 * 構造化に失敗した場合でも original のみの値として扱う(値を失わない)。
 */
export const lifeDateSchema = z.object({
  original: z.string(),
  calendar: calendarSchema.optional(),
  /** calendar === 'japanese' の場合の元号(例: '明治') */
  era: z.string().optional(),
  /** calendar === 'japanese' の場合は元号内の年、'gregorian' の場合は西暦年 */
  year: z.number().int().optional(),
  month: z.number().int().min(1).max(12).optional(),
  day: z.number().int().min(1).max(31).optional(),
  qualifier: dateQualifierSchema.optional(),
})
export type LifeDate = z.infer<typeof lifeDateSchema>

/** 原文のみで構造化できていない日付かどうか */
export function isUnstructuredDate(date: LifeDate): boolean {
  return (
    date.calendar === undefined &&
    date.year === undefined &&
    date.month === undefined &&
    date.day === undefined
  )
}

import { z } from 'zod'
import { lifeDateSchema } from './date'
import { personNameSchema } from './name'
import { gedcomNodeSchema } from './gedcomNode'

export const genderSchema = z.enum(['male', 'female', 'x', 'unknown'])
export type Gender = z.infer<typeof genderSchema>

export const lifeEventSchema = z.object({
  date: lifeDateSchema.optional(),
  place: z.string().optional(),
})
export type LifeEvent = z.infer<typeof lifeEventSchema>

export const personEventSchema = z.object({
  /** 自由記述のイベント種別(例: 'occupation', 'religion') */
  type: z.string(),
  date: lifeDateSchema.optional(),
  place: z.string().optional(),
  note: z.string().optional(),
})
export type PersonEvent = z.infer<typeof personEventSchema>

/**
 * 家系図の人物。すべての属性は未入力(不明)を許容する。
 */
export const personSchema = z.object({
  id: z.string(),
  name: personNameSchema.optional(),
  gender: genderSchema.optional(),
  birth: lifeEventSchema.optional(),
  death: lifeEventSchema.optional(),
  events: z.array(personEventSchema).optional(),
  note: z.string().optional(),
  /** インポート時に意味を解釈しなかったGEDCOMタグの保全領域 */
  unmappedTags: z.array(gedcomNodeSchema).optional(),
})
export type Person = z.infer<typeof personSchema>

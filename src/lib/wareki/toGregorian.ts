import { findEraByName } from './eras'
import { dateNumber } from './dateNumber'
import type { ConversionResult } from './types'

export interface JapaneseDateInput {
  era: string
  year: number
  month?: number
  day?: number
}

export interface GregorianDate {
  year: number
  month?: number
  day?: number
}

/** 和暦(元号+年)を西暦に変換する。範囲外・改元境界を越えた日付は変換失敗を返す。 */
export function japaneseToGregorian(
  input: JapaneseDateInput,
): ConversionResult<GregorianDate> {
  const era = findEraByName(input.era)
  if (!era) {
    return { success: false, reason: `未収録の元号です: ${input.era}` }
  }
  if (input.year < 1) {
    return { success: false, reason: '元号年は1以上である必要があります' }
  }

  const gregorianYear = era.startYear + input.year - 1

  if (era.endYear !== undefined && gregorianYear > era.endYear) {
    return {
      success: false,
      reason: `${input.era}${input.year}年は元号の範囲外です`,
    }
  }

  if (gregorianYear === era.startYear && input.month !== undefined) {
    const candidate = dateNumber(gregorianYear, input.month, input.day ?? 1)
    const start = dateNumber(era.startYear, era.startMonth, era.startDay)
    if (candidate < start) {
      return {
        success: false,
        reason: `${input.era}${input.year}年${input.month}月は改元前の日付のため変換できません`,
      }
    }
  }

  if (
    era.endYear !== undefined &&
    gregorianYear === era.endYear &&
    input.month !== undefined
  ) {
    const candidate = dateNumber(gregorianYear, input.month, input.day ?? 31)
    const end = dateNumber(era.endYear, era.endMonth ?? 12, era.endDay ?? 31)
    if (candidate > end) {
      return {
        success: false,
        reason: `${input.era}${input.year}年${input.month}月は改元後の日付のため変換できません`,
      }
    }
  }

  return {
    success: true,
    value: { year: gregorianYear, month: input.month, day: input.day },
  }
}

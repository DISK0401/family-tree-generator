import { eraTable } from './eras'
import { dateNumber } from './dateNumber'
import type { ConversionResult } from './types'

export interface GregorianDateInput {
  year: number
  month?: number
  day?: number
}

export interface JapaneseDate {
  era: string
  year: number
  month?: number
  day?: number
}

function eraContainsPoint(
  era: (typeof eraTable)[number],
  point: number,
): boolean {
  const start = dateNumber(era.startYear, era.startMonth, era.startDay)
  const end =
    era.endYear !== undefined
      ? dateNumber(era.endYear, era.endMonth ?? 12, era.endDay ?? 31)
      : undefined
  return point >= start && (end === undefined || point <= end)
}

/**
 * 西暦を和暦に変換する。改元境界をまたぐ年について月日が指定されない場合、
 * 元号を一意に決定できないため変換失敗を返す(月日を指定すれば一意に決まる)。
 */
export function gregorianToJapanese(
  input: GregorianDateInput,
): ConversionResult<JapaneseDate> {
  const { year, month, day } = input

  if (month !== undefined) {
    const point = dateNumber(year, month, day ?? 1)
    const era = eraTable.find((candidate) => eraContainsPoint(candidate, point))
    if (!era) {
      return {
        success: false,
        reason: `対応する元号が見つかりません: ${year}年`,
      }
    }
    return {
      success: true,
      value: { era: era.name, year: year - era.startYear + 1, month, day },
    }
  }

  const overlapping = eraTable.filter(
    (era) =>
      era.startYear <= year &&
      (era.endYear === undefined || era.endYear >= year),
  )

  if (overlapping.length === 0) {
    return { success: false, reason: `対応する元号が見つかりません: ${year}年` }
  }
  if (overlapping.length > 1) {
    return {
      success: false,
      reason: `${year}年は改元をまたぐため、月日がないと元号を一意に決定できません`,
    }
  }

  const era = overlapping[0]
  return {
    success: true,
    value: { era: era.name, year: year - era.startYear + 1 },
  }
}

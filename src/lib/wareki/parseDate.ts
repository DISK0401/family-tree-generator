import { findEraByName } from './eras'
import { kanjiToInt } from './kanjiNumber'
import type { DateQualifier, LifeDate } from '../../domain/date'

const QUALIFIER_TOKEN = '(?:頃|ごろ|以前|以後|以降|推定)'
const NUMBER_TOKEN = '(?:\\d+|元|[〇一二三四五六七八九十]+)'

const ERA_NAMES = [
  '明治',
  '大正',
  '昭和',
  '平成',
  '令和',
  '文化',
  '文政',
  '天保',
  '弘化',
  '嘉永',
  '安政',
  '万延',
  '文久',
  '元治',
  '慶応',
]

const JAPANESE_DATE_REGEX = new RegExp(
  `^(${ERA_NAMES.join('|')})(${NUMBER_TOKEN})年(?:(${NUMBER_TOKEN})月(?:(${NUMBER_TOKEN})日)?)?(${QUALIFIER_TOKEN})?$`,
)

const GREGORIAN_YMD_DASH =
  /^(\d{3,4})-(\d{1,2})-(\d{1,2})(頃|ごろ|以前|以後|以降|推定)?$/
const GREGORIAN_YMD_SLASH =
  /^(\d{3,4})\/(\d{1,2})\/(\d{1,2})(頃|ごろ|以前|以後|以降|推定)?$/
const GREGORIAN_YMD_KANJI =
  /^(\d{3,4})年(\d{1,2})月(\d{1,2})日(頃|ごろ|以前|以後|以降|推定)?$/
const GREGORIAN_YM_KANJI =
  /^(\d{3,4})年(\d{1,2})月(頃|ごろ|以前|以後|以降|推定)?$/
const GREGORIAN_Y = /^(\d{3,4})年?(頃|ごろ|以前|以後|以降|推定)?$/

function toQualifier(token: string | undefined): DateQualifier | undefined {
  switch (token) {
    case '頃':
    case 'ごろ':
      return 'about'
    case '以前':
      return 'before'
    case '以後':
    case '以降':
      return 'after'
    case '推定':
      return 'estimated'
    default:
      return undefined
  }
}

function parseNumberToken(token: string): number | undefined {
  if (/^\d+$/.test(token)) {
    return Number(token)
  }
  return kanjiToInt(token)
}

type PartialDate = Omit<LifeDate, 'original'>

function tryParseJapanese(trimmed: string): PartialDate | undefined {
  const match = JAPANESE_DATE_REGEX.exec(trimmed)
  if (!match) {
    return undefined
  }
  const [, eraName, yearToken, monthToken, dayToken, qualifierToken] = match
  const era = findEraByName(eraName)
  const year = parseNumberToken(yearToken)
  if (!era || year === undefined) {
    return undefined
  }
  return {
    calendar: 'japanese',
    era: eraName,
    year,
    month: monthToken ? parseNumberToken(monthToken) : undefined,
    day: dayToken ? parseNumberToken(dayToken) : undefined,
    qualifier: toQualifier(qualifierToken),
  }
}

function tryParseGregorian(trimmed: string): PartialDate | undefined {
  let match =
    GREGORIAN_YMD_DASH.exec(trimmed) ?? GREGORIAN_YMD_SLASH.exec(trimmed)
  if (match) {
    const [, year, month, day, qualifier] = match
    return {
      calendar: 'gregorian',
      year: Number(year),
      month: Number(month),
      day: Number(day),
      qualifier: toQualifier(qualifier),
    }
  }

  match = GREGORIAN_YMD_KANJI.exec(trimmed)
  if (match) {
    const [, year, month, day, qualifier] = match
    return {
      calendar: 'gregorian',
      year: Number(year),
      month: Number(month),
      day: Number(day),
      qualifier: toQualifier(qualifier),
    }
  }

  match = GREGORIAN_YM_KANJI.exec(trimmed)
  if (match) {
    const [, year, month, qualifier] = match
    return {
      calendar: 'gregorian',
      year: Number(year),
      month: Number(month),
      qualifier: toQualifier(qualifier),
    }
  }

  match = GREGORIAN_Y.exec(trimmed)
  if (match) {
    const [, year, qualifier] = match
    return {
      calendar: 'gregorian',
      year: Number(year),
      qualifier: toQualifier(qualifier),
    }
  }

  return undefined
}

/**
 * 日付文字列を構造化する。和暦(漢数字・修飾子を含む)・西暦の代表的な表記に対応する。
 * 構造化できない原文は original のみの値として返し、値を失わない。
 */
export function parseDateString(original: string): LifeDate {
  const trimmed = original.trim()

  const structured =
    tryParseJapanese(trimmed) ?? tryParseGregorian(trimmed) ?? undefined

  if (!structured) {
    return { original }
  }

  return { original, ...structured }
}

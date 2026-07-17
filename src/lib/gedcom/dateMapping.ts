import type { DateQualifier, LifeDate } from '../../domain/date'
import type { GedcomNode } from '../../domain/gedcomNode'
import { japaneseToGregorian } from '../wareki/toGregorian'
import type { GedcomVersion } from './version'
import { findChild } from './nodeHelpers'

const MONTHS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
]

const MONTH_INDEX: Record<string, number> = MONTHS.reduce(
  (acc, month, index) => {
    acc[month] = index + 1
    return acc
  },
  {} as Record<string, number>,
)

const QUALIFIER_PREFIX: Record<DateQualifier, string> = {
  about: 'ABT',
  before: 'BEF',
  after: 'AFT',
  estimated: 'EST',
}

const QUALIFIER_BY_PREFIX: Record<string, DateQualifier> = {
  ABT: 'about',
  BEF: 'before',
  AFT: 'after',
  EST: 'estimated',
  CAL: 'estimated',
}

function formatGregorianDatePart(
  year: number,
  month?: number,
  day?: number,
): string {
  const parts: string[] = []
  if (day !== undefined) {
    parts.push(String(day))
  }
  if (month !== undefined) {
    parts.push(MONTHS[month - 1])
  }
  parts.push(String(year))
  return parts.join(' ')
}

export interface DateExportResult {
  /** DATEタグそのもの(PHRASE等の子ノードを含む) */
  dateNode: GedcomNode
  /** DATEと同じ階層に追加する兄弟ノード(5.5.1でのNOTE保全用) */
  siblingNodes: GedcomNode[]
}

/**
 * LifeDate をGEDCOMのDATE構造へ変換する。西暦換算できる場合は構造化DATE値を
 * 出力し、原文は7.0ではPHRASE、5.5.1ではNOTE(構造化できた場合)または
 * 丸括弧の日付句(構造化できない場合)で保全する(design.md D4)。
 */
export function lifeDateToGedcomNode(
  date: LifeDate,
  version: GedcomVersion,
): DateExportResult {
  const qualifierPrefix = date.qualifier
    ? QUALIFIER_PREFIX[date.qualifier]
    : undefined

  let gregorian: { year: number; month?: number; day?: number } | undefined

  if (date.calendar === 'gregorian' && date.year !== undefined) {
    gregorian = { year: date.year, month: date.month, day: date.day }
  } else if (
    date.calendar === 'japanese' &&
    date.era !== undefined &&
    date.year !== undefined
  ) {
    const converted = japaneseToGregorian({
      era: date.era,
      year: date.year,
      month: date.month,
      day: date.day,
    })
    if (converted.success) {
      gregorian = converted.value
    }
  }

  if (!gregorian) {
    if (version === '7.0') {
      return {
        dateNode: {
          tag: 'DATE',
          children: [{ tag: 'PHRASE', value: date.original, children: [] }],
        },
        siblingNodes: [],
      }
    }
    return {
      dateNode: { tag: 'DATE', value: `(${date.original})`, children: [] },
      siblingNodes: [],
    }
  }

  const datePart = formatGregorianDatePart(
    gregorian.year,
    gregorian.month,
    gregorian.day,
  )
  const value = qualifierPrefix ? `${qualifierPrefix} ${datePart}` : datePart

  if (date.calendar === 'japanese') {
    if (version === '7.0') {
      return {
        dateNode: {
          tag: 'DATE',
          value,
          children: [{ tag: 'PHRASE', value: date.original, children: [] }],
        },
        siblingNodes: [],
      }
    }
    return {
      dateNode: { tag: 'DATE', value, children: [] },
      siblingNodes: [
        { tag: 'NOTE', value: `元の表記: ${date.original}`, children: [] },
      ],
    }
  }

  return {
    dateNode: { tag: 'DATE', value, children: [] },
    siblingNodes: [],
  }
}

/** GEDCOMのDATEノードを LifeDate へ変換する。解釈できない場合は原文のみを返す。 */
export function gedcomDateNodeToLifeDate(node: GedcomNode): LifeDate {
  const phrase = findChild(node, 'PHRASE')?.value
  const raw = node.value?.trim()

  if (!raw) {
    return { original: phrase ?? '' }
  }

  const phraseMatch = /^\((.*)\)$/.exec(raw)
  if (phraseMatch) {
    return { original: phrase ?? phraseMatch[1] }
  }

  let rest = raw
  let qualifier: DateQualifier | undefined
  for (const [prefix, mapped] of Object.entries(QUALIFIER_BY_PREFIX)) {
    if (rest.startsWith(`${prefix} `)) {
      qualifier = mapped
      rest = rest.slice(prefix.length + 1)
      break
    }
  }

  const tokens = rest.split(/\s+/).filter(Boolean)
  let day: number | undefined
  let month: number | undefined
  let year: number | undefined

  if (tokens.length === 3) {
    day = Number(tokens[0])
    month = MONTH_INDEX[tokens[1].toUpperCase()]
    year = Number(tokens[2])
  } else if (tokens.length === 2) {
    month = MONTH_INDEX[tokens[0].toUpperCase()]
    year = Number(tokens[1])
  } else if (tokens.length === 1) {
    year = Number(tokens[0])
  }

  if (year === undefined || Number.isNaN(year)) {
    return { original: phrase ?? raw }
  }

  return {
    original: phrase ?? raw,
    calendar: 'gregorian',
    year,
    month,
    day: tokens.length === 3 ? day : undefined,
    qualifier,
  }
}

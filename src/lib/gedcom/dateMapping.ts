import type { CalendarDate, DateQualifier, FuzzyDate } from '../../domain/types'
import type { GedcomNode } from '../../domain/gedcomNode'
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

const QUALIFIER_PREFIX: Partial<Record<DateQualifier, string>> = {
  about: 'ABT',
  before: 'BEF',
  after: 'AFT',
}

const QUALIFIER_BY_PREFIX: Record<string, DateQualifier> = {
  ABT: 'about',
  BEF: 'before',
  AFT: 'after',
  EST: 'about',
  CAL: 'about',
}

function formatDatePart(date: CalendarDate): string {
  const parts: string[] = []
  if (date.day !== undefined) {
    parts.push(String(date.day))
  }
  if (date.month !== undefined) {
    parts.push(MONTHS[date.month - 1])
  }
  parts.push(String(date.year))
  return parts.join(' ')
}

function formatDateValue(date: FuzzyDate): string | undefined {
  if (!date.date) {
    return undefined
  }
  if (date.qualifier === 'between' && date.date2) {
    return `BET ${formatDatePart(date.date)} AND ${formatDatePart(date.date2)}`
  }
  const prefix = QUALIFIER_PREFIX[date.qualifier]
  return prefix
    ? `${prefix} ${formatDatePart(date.date)}`
    : formatDatePart(date.date)
}

export interface DateExportResult {
  /** DATEタグそのもの(PHRASE等の子ノードを含む) */
  dateNode: GedcomNode
  /** DATEと同じ階層に追加する兄弟ノード(5.5.1でのNOTE保全用) */
  siblingNodes: GedcomNode[]
}

/**
 * FuzzyDate をGEDCOMのDATE構造へ変換する。7.0では原文をPHRASEで保全し、
 * 5.5.1では構造化DATE値のみを出力しつつ原文をNOTEで補足する
 * (docs/gedcom-mapping.md「FuzzyDate ↔ DATE」参照。5.5.1固有の扱いは本変更で追加)。
 */
export function fuzzyDateToGedcomNode(
  date: FuzzyDate,
  version: GedcomVersion,
): DateExportResult {
  const value = formatDateValue(date)

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

  if (!value) {
    return {
      dateNode: { tag: 'DATE', value: `(${date.original})`, children: [] },
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

/**
 * GEDCOMの日付本体("DAY MON YEAR" / "MON YEAR" / "YEAR")を解釈する。
 * 月トークンがGEDCOMの月略称として認識できない場合(JULIAN等の暦種別接頭辞、
 * FROM/TOのような本パーサ未対応の範囲表現等)は、年だけを取り出して誤った
 * 精度の値を返すのではなく、解釈不能として undefined を返す(実在するGEDCOM
 * テストファイル(date-all.ged)で判明した「暦種別を無視して年だけ誤読する」
 * 問題への対応。原文は呼び出し元でoriginalとして保持されるため情報は失わない)。
 */
function parseGedcomDatePart(text: string): CalendarDate | undefined {
  const tokens = text.trim().split(/\s+/).filter(Boolean)

  if (tokens.length === 3) {
    const day = Number(tokens[0])
    const month = MONTH_INDEX[tokens[1].toUpperCase()]
    const year = Number(tokens[2])
    if (month === undefined || Number.isNaN(day) || Number.isNaN(year)) {
      return undefined
    }
    return { year, month, day }
  }
  if (tokens.length === 2) {
    const month = MONTH_INDEX[tokens[0].toUpperCase()]
    const year = Number(tokens[1])
    if (month === undefined || Number.isNaN(year)) {
      return undefined
    }
    return { year, month }
  }
  if (tokens.length === 1) {
    const year = Number(tokens[0])
    if (Number.isNaN(year)) {
      return undefined
    }
    return { year }
  }
  return undefined
}

/** GEDCOMのDATEノードを FuzzyDate へ変換する。解釈できない場合は原文のみを返す。 */
export function gedcomNodeToFuzzyDate(node: GedcomNode): FuzzyDate {
  const phrase = findChild(node, 'PHRASE')?.value
  const raw = node.value?.trim()

  if (!raw) {
    return { original: phrase ?? '', qualifier: 'exact' }
  }

  const parenMatch = /^\((.*)\)$/.exec(raw)
  if (parenMatch) {
    return { original: phrase ?? parenMatch[1], qualifier: 'exact' }
  }

  const betweenMatch = /^BET\s+(.+?)\s+AND\s+(.+)$/i.exec(raw)
  if (betweenMatch) {
    const date = parseGedcomDatePart(betweenMatch[1])
    const date2 = parseGedcomDatePart(betweenMatch[2])
    if (date) {
      return { original: phrase ?? raw, qualifier: 'between', date, date2 }
    }
  }

  let rest = raw
  let qualifier: DateQualifier = 'exact'
  for (const [prefix, mapped] of Object.entries(QUALIFIER_BY_PREFIX)) {
    if (rest.startsWith(`${prefix} `)) {
      qualifier = mapped
      rest = rest.slice(prefix.length + 1)
      break
    }
  }

  const date = parseGedcomDatePart(rest)
  if (!date) {
    return { original: phrase ?? raw, qualifier: 'exact' }
  }
  return { original: phrase ?? raw, qualifier, date }
}

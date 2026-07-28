import type { PersonName } from '../../domain/types'
import type { GedcomNode } from '../../domain/gedcomNode'
import type { GedcomVersion } from './version'
import { findChild } from './nodeHelpers'

function buildNameValue(
  given: string | undefined,
  surname: string | undefined,
): string {
  const parts: string[] = []
  if (given) {
    parts.push(given)
  }
  if (surname !== undefined) {
    parts.push(`/${surname}/`)
  }
  return parts.join(' ')
}

/**
 * NAME行値(例: `太郎 /山田/`、`John /Doe/ Jr.`)を given / surname に分解する。
 * - `/姓/` の前が given、間が surname
 * - `/姓/` の後(後置suffix)は本モデルに対応フィールドがないため、情報を
 *   失わないよう given の末尾へ空白区切りで残す
 * - スラッシュ区切りが無い場合は全体を given とみなす
 */
function parseNameValue(value: string): { given?: string; surname?: string } {
  const trimmed = value.trim()
  if (trimmed === '') {
    return {}
  }
  const match = /^([^/]*)\/([^/]*)\/(.*)$/.exec(trimmed)
  if (!match) {
    return { given: trimmed }
  }
  const [, before, surnamePart, after] = match
  const givenParts = [before.trim(), after.trim()].filter((part) => part !== '')
  const surname = surnamePart.trim()
  return {
    given: givenParts.length > 0 ? givenParts.join(' ') : undefined,
    surname: surname !== '' ? surname : undefined,
  }
}

/**
 * PersonName を GEDCOM の NAME レコードへ変換する(docs/gedcom-mapping.md準拠)。
 * surname/given は SURN/GIVN サブ構造、ふりがなは拡張タグ _KANA_SURN/_KANA_GIVN。
 * 拡張タグを解釈しないツールでもふりがなを読めるよう、標準タグを併記する:
 * - 5.5.1: `FONE <かな値>` + `TYPE kana`
 * - 7.0: `TRAN <かな値>` + `LANG ja-Kana`
 * (かな値は NAME 行値と同じ `名 /姓/` 形式)
 * 旧字体・異体字は正規化せずそのまま出力する。
 */
export function personNameToGedcomNode(
  name: PersonName,
  version: GedcomVersion,
): GedcomNode {
  const children: GedcomNode[] = []

  if (name.given) {
    children.push({ tag: 'GIVN', value: name.given, children: [] })
  }
  if (name.surname) {
    children.push({ tag: 'SURN', value: name.surname, children: [] })
  }

  if (name.givenKana || name.surnameKana) {
    const kanaValue = buildNameValue(name.givenKana, name.surnameKana)
    if (version === '7.0') {
      children.push({
        tag: 'TRAN',
        value: kanaValue,
        children: [{ tag: 'LANG', value: 'ja-Kana', children: [] }],
      })
    } else {
      children.push({
        tag: 'FONE',
        value: kanaValue,
        children: [{ tag: 'TYPE', value: 'kana', children: [] }],
      })
    }
  }

  if (name.surnameKana) {
    children.push({
      tag: '_KANA_SURN',
      value: name.surnameKana,
      children: [],
    })
  }
  if (name.givenKana) {
    children.push({ tag: '_KANA_GIVN', value: name.givenKana, children: [] })
  }

  return {
    tag: 'NAME',
    value: buildNameValue(name.given, name.surname),
    children,
  }
}

/** FONEのTYPE値のうち、かな表記とみなすもの(大小文字は区別しない) */
const KANA_FONE_TYPES = new Set(['kana', 'hiragana', 'katakana'])

/**
 * 標準の音訳サブ構造からかな値を探す。
 * - FONE(5.5.1): TYPE がかな系のもの
 * - TRAN(7.0): LANG が日本語(ja / ja-Kana / ja-Hira 等)のもの
 */
function findKanaVariantValue(nameNode: GedcomNode): string | undefined {
  for (const child of nameNode.children) {
    if (child.tag === 'FONE' && child.value) {
      const type = findChild(child, 'TYPE')?.value?.trim().toLowerCase()
      if (type !== undefined && KANA_FONE_TYPES.has(type)) {
        return child.value
      }
    }
    if (child.tag === 'TRAN' && child.value) {
      const lang = findChild(child, 'LANG')?.value?.trim().toLowerCase()
      if (lang !== undefined && lang.startsWith('ja')) {
        return child.value
      }
    }
  }
  return undefined
}

/**
 * GEDCOMのNAMEレコードを PersonName へ変換する。SURN/GIVNサブ構造を正とし、
 * サブタグが無い場合のみ NAME 行値(例: `太郎 /山田/`)の解析で補完する。
 * ふりがなは拡張タグ _KANA_SURN/_KANA_GIVN を優先し、無ければ
 * FONE(TYPE kana系)/ TRAN(LANG ja-*)の `名 /姓/` 形式から補完する。
 */
export function gedcomNodeToPersonName(nameNode: GedcomNode): PersonName {
  const parsedValue =
    nameNode.value !== undefined ? parseNameValue(nameNode.value) : {}

  const kanaSurn = findChild(nameNode, '_KANA_SURN')?.value
  const kanaGivn = findChild(nameNode, '_KANA_GIVN')?.value
  let surnameKana = kanaSurn
  let givenKana = kanaGivn
  if (kanaSurn === undefined && kanaGivn === undefined) {
    const kanaValue = findKanaVariantValue(nameNode)
    if (kanaValue !== undefined) {
      const parsedKana = parseNameValue(kanaValue)
      surnameKana = parsedKana.surname
      givenKana = parsedKana.given
    }
  }

  return {
    surname: findChild(nameNode, 'SURN')?.value ?? parsedValue.surname,
    given: findChild(nameNode, 'GIVN')?.value ?? parsedValue.given,
    surnameKana,
    givenKana,
  }
}

import type { PersonName } from '../../domain/types'
import type { GedcomNode } from '../../domain/gedcomNode'
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
 * PersonName を GEDCOM の NAME レコードへ変換する(docs/gedcom-mapping.md準拠)。
 * surname/given は SURN/GIVN サブ構造、ふりがなは拡張タグ _KANA_SURN/_KANA_GIVN。
 * 旧字体・異体字は正規化せずそのまま出力する。
 */
export function personNameToGedcomNode(name: PersonName): GedcomNode {
  const children: GedcomNode[] = []

  if (name.given) {
    children.push({ tag: 'GIVN', value: name.given, children: [] })
  }
  if (name.surname) {
    children.push({ tag: 'SURN', value: name.surname, children: [] })
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

/** GEDCOMのNAMEレコードを PersonName へ変換する。SURN/GIVNサブ構造を正とする。 */
export function gedcomNodeToPersonName(nameNode: GedcomNode): PersonName {
  return {
    surname: findChild(nameNode, 'SURN')?.value,
    given: findChild(nameNode, 'GIVN')?.value,
    surnameKana: findChild(nameNode, '_KANA_SURN')?.value,
    givenKana: findChild(nameNode, '_KANA_GIVN')?.value,
  }
}

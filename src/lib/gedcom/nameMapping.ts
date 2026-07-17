import type { KanaName, PersonName } from '../../domain/name'
import type { GedcomNode } from '../../domain/gedcomNode'
import type { GedcomVersion } from './version'
import { findChild, findChildren } from './nodeHelpers'

function buildNameValue(
  given: string | undefined,
  family: string | undefined,
): string {
  const parts: string[] = []
  if (given) {
    parts.push(given)
  }
  if (family !== undefined) {
    parts.push(`/${family}/`)
  }
  return parts.join(' ')
}

function parseNameValue(value: string): { given?: string; family?: string } {
  const match = /^([^/]*)\/([^/]*)\/\s*$/.exec(value.trim())
  if (match) {
    const given = match[1].trim()
    const family = match[2].trim()
    return { given: given || undefined, family: family || undefined }
  }
  const trimmed = value.trim()
  return trimmed ? { given: trimmed } : {}
}

function buildKanaRomanNodes(
  name: PersonName,
  version: GedcomVersion,
): GedcomNode[] {
  const nodes: GedcomNode[] = []
  const hasKana = name.kana && (name.kana.given || name.kana.family)

  if (version === '7.0') {
    if (hasKana) {
      nodes.push({
        tag: 'TRAN',
        value: buildNameValue(name.kana?.given, name.kana?.family),
        children: [{ tag: 'LANG', value: 'ja-Hira', children: [] }],
      })
    }
    if (name.romanized) {
      nodes.push({
        tag: 'TRAN',
        value: name.romanized,
        children: [{ tag: 'LANG', value: 'ja-Latn', children: [] }],
      })
    }
  } else {
    if (hasKana) {
      nodes.push({
        tag: '_KANA',
        value: buildNameValue(name.kana?.given, name.kana?.family),
        children: [],
      })
    }
    if (name.romanized) {
      nodes.push({ tag: 'ROMN', value: name.romanized, children: [] })
    }
  }

  return nodes
}

function nameToNameNode(
  name: PersonName,
  version: GedcomVersion,
  type?: string,
): GedcomNode {
  const children = buildKanaRomanNodes(name, version)
  if (type) {
    children.unshift({ tag: 'TYPE', value: type, children: [] })
  }
  return {
    tag: 'NAME',
    value: buildNameValue(name.given, name.family),
    children,
  }
}

/**
 * PersonName を GEDCOM の NAME レコード群へ変換する。主表記が最初の NAME、
 * alternates(別表記)は TYPE aka を伴う追加の NAME レコードとして出力する。
 * 旧字体等の文字は正規化せずそのまま出力する。
 */
export function personNameToGedcomNodes(
  name: PersonName | undefined,
  version: GedcomVersion,
): GedcomNode[] {
  if (!name) {
    return []
  }
  const nodes: GedcomNode[] = [nameToNameNode(name, version)]
  for (const alternate of name.alternates ?? []) {
    nodes.push(nameToNameNode(alternate, version, 'aka'))
  }
  return nodes
}

function readKanaRoman(
  node: GedcomNode,
  version: GedcomVersion,
): { kana?: KanaName; romanized?: string } {
  let kana: KanaName | undefined
  let romanized: string | undefined

  if (version === '7.0') {
    for (const tran of findChildren(node, 'TRAN')) {
      const lang = findChild(tran, 'LANG')?.value ?? ''
      if (/hira|kana/i.test(lang)) {
        const parsed = parseNameValue(tran.value ?? '')
        kana = { family: parsed.family, given: parsed.given }
      } else if (/latn/i.test(lang)) {
        romanized = tran.value
      }
    }
  } else {
    const kanaNode = findChild(node, '_KANA')
    const romnNode = findChild(node, 'ROMN')
    if (kanaNode?.value) {
      const parsed = parseNameValue(kanaNode.value)
      kana = { family: parsed.family, given: parsed.given }
    }
    if (romnNode?.value) {
      romanized = romnNode.value
      if (!kana) {
        // Open Question(design.md)の妥協案: _KANAが無い場合はROMNの値も
        // かな候補として解釈する(実装時にどちらでも読み込めるようにする方針)。
        const parsed = parseNameValue(romnNode.value)
        kana = { family: parsed.family, given: parsed.given }
      }
    }
  }

  return { kana, romanized }
}

function nameNodeToPersonName(
  node: GedcomNode,
  version: GedcomVersion,
): PersonName {
  const { given, family } = parseNameValue(node.value ?? '')
  const { kana, romanized } = readKanaRoman(node, version)
  return { given, family, kana, romanized }
}

/** GEDCOMのNAMEレコード群(主表記+別表記)を PersonName へ変換する。 */
export function gedcomNameNodesToPersonName(
  nameNodes: GedcomNode[],
  version: GedcomVersion,
): PersonName | undefined {
  if (nameNodes.length === 0) {
    return undefined
  }
  const [primaryNode, ...alternateNodes] = nameNodes
  const primary = nameNodeToPersonName(primaryNode, version)
  const alternates = alternateNodes.map((node) =>
    nameNodeToPersonName(node, version),
  )
  return alternates.length > 0 ? { ...primary, alternates } : primary
}

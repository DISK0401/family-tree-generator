import type { FamilyTreeData } from '../../domain/model'
import type { Person, Gender, LifeEvent } from '../../domain/person'
import type { Family } from '../../domain/family'
import type { GedcomNode } from '../../domain/gedcomNode'
import { createId } from '../../domain/id'
import { decodeGedcomBytes, type DetectedEncoding } from './encoding'
import { parseGedcomText } from './parser'
import { detectGedcomVersion, type GedcomVersion } from './version'
import { findChild, findChildren, pointerToXref } from './nodeHelpers'
import { gedcomNameNodesToPersonName } from './nameMapping'
import { gedcomDateNodeToLifeDate } from './dateMapping'
import { pediToChildPedigree, type PedigreeImportResult } from './pedigree'
import { gedcomNodesToRelationshipType } from './relationshipMapping'

export interface ImportWarning {
  lineNumber?: number
  tag?: string
  message: string
}

export interface GedcomImportSuccess {
  success: true
  data: FamilyTreeData
  version: GedcomVersion
  encoding: DetectedEncoding
  warnings: ImportWarning[]
}

export interface GedcomImportFailure {
  success: false
  reason: string
}

export type GedcomImportResult = GedcomImportSuccess | GedcomImportFailure

const KNOWN_INDI_TAGS = new Set([
  'NAME',
  'SEX',
  'BIRT',
  'DEAT',
  'FAMC',
  'FAMS',
  'NOTE',
])
const KNOWN_FAM_TAGS = new Set([
  'HUSB',
  'WIF',
  'CHIL',
  'MARR',
  'DIV',
  'ANUL',
  'EVEN',
  'NOTE',
])
const KNOWN_TOP_LEVEL_TAGS = new Set(['HEAD', 'TRLR', 'INDI', 'FAM'])

const SEX_MAP: Record<string, Gender> = {
  M: 'male',
  F: 'female',
  X: 'x',
  U: 'unknown',
}

function mapGender(value: string | undefined): Gender | undefined {
  if (!value) {
    return undefined
  }
  return SEX_MAP[value.trim().toUpperCase()]
}

function collectUnmapped(node: GedcomNode, known: Set<string>): GedcomNode[] {
  return node.children.filter((child) => !known.has(child.tag))
}

function mapLifeEvent(eventNode: GedcomNode): LifeEvent {
  const dateNode = findChild(eventNode, 'DATE')
  const place = findChild(eventNode, 'PLAC')?.value
  return {
    date: dateNode ? gedcomDateNodeToLifeDate(dateNode) : undefined,
    place,
  }
}

function joinNotes(node: GedcomNode): string | undefined {
  const notes = findChildren(node, 'NOTE')
    .map((note) => note.value)
    .filter((value): value is string => value !== undefined)
  return notes.length > 0 ? notes.join('\n') : undefined
}

function mapIndiToPerson(indi: GedcomNode, version: GedcomVersion): Person {
  const nameNodes = findChildren(indi, 'NAME')
  const birtNode = findChild(indi, 'BIRT')
  const deatNode = findChild(indi, 'DEAT')

  return {
    id: createId(),
    name: gedcomNameNodesToPersonName(nameNodes, version),
    gender: mapGender(findChild(indi, 'SEX')?.value),
    birth: birtNode ? mapLifeEvent(birtNode) : undefined,
    death: deatNode ? mapLifeEvent(deatNode) : undefined,
    note: joinNotes(indi),
    unmappedTags: collectUnmapped(indi, KNOWN_INDI_TAGS),
  }
}

function extractFamcPedigrees(
  indi: GedcomNode,
): Map<string, PedigreeImportResult> {
  const map = new Map<string, PedigreeImportResult>()
  for (const famc of findChildren(indi, 'FAMC')) {
    const famXref = pointerToXref(famc.value)
    if (!famXref) {
      continue
    }
    map.set(famXref, pediToChildPedigree(findChild(famc, 'PEDI')?.value))
  }
  return map
}

function mapFamToFamily(
  fam: GedcomNode,
  xrefToPersonId: Map<string, string>,
  childPedigreeLookup: Map<string, Map<string, PedigreeImportResult>>,
  warnings: ImportWarning[],
): Family {
  const partnerXrefs = [
    pointerToXref(findChild(fam, 'HUSB')?.value),
    pointerToXref(findChild(fam, 'WIF')?.value),
  ].filter((xref): xref is string => xref !== undefined)

  const partnerIds = partnerXrefs
    .map((xref) => xrefToPersonId.get(xref))
    .filter((id): id is string => id !== undefined)

  const marrNode = findChild(fam, 'MARR')
  const divNode = findChild(fam, 'DIV')
  const marrEvent = marrNode ? mapLifeEvent(marrNode) : undefined
  const divEvent = divNode ? mapLifeEvent(divNode) : undefined

  const famXref = fam.xref
  const children = findChildren(fam, 'CHIL').map((chilNode) => {
    const childXref = pointerToXref(chilNode.value)
    const personId = childXref ? xrefToPersonId.get(childXref) : undefined
    const pediResult =
      childXref && famXref
        ? childPedigreeLookup.get(childXref)?.get(famXref)
        : undefined

    if (pediResult?.unrecognized) {
      warnings.push({
        tag: 'PEDI',
        message: `続柄を解釈できなかったため実子として扱いました(FAM @${famXref ?? '?'}@)`,
      })
    }
    if (!personId) {
      warnings.push({
        tag: 'CHIL',
        message: `子として参照されている人物が見つかりません(FAM @${famXref ?? '?'}@, 参照先 @${childXref ?? '?'}@)`,
      })
    }

    return {
      personId: personId ?? childXref ?? createId(),
      pedigree: pediResult?.pedigree ?? 'biological',
    }
  })

  return {
    id: createId(),
    partnerIds,
    relationshipType: gedcomNodesToRelationshipType(fam),
    marriageDate: marrEvent?.date,
    marriagePlace: marrEvent?.place,
    divorceDate: divEvent?.date,
    children,
    note: joinNotes(fam),
    unmappedTags: collectUnmapped(fam, KNOWN_FAM_TAGS),
  }
}

/**
 * GEDCOMファイルのバイト列をインポートする。文字コード判定→構文解析→
 * バージョン判定→意味層マッピングの順で処理し、ベストエフォートで
 * 警告付きインポートを成立させる(design.md D8)。
 */
export function importGedcom(bytes: Uint8Array): GedcomImportResult {
  const decoded = decodeGedcomBytes(bytes)
  if (!decoded.success) {
    return { success: false, reason: decoded.reason }
  }

  const { roots, warnings: parseWarnings } = parseGedcomText(decoded.text)

  const versionResult = detectGedcomVersion(roots)
  if (!versionResult.success) {
    return { success: false, reason: versionResult.reason }
  }
  const version = versionResult.value

  const warnings: ImportWarning[] = parseWarnings.map((warning) => ({
    lineNumber: warning.lineNumber,
    message: warning.message,
  }))

  for (const root of roots) {
    if (!KNOWN_TOP_LEVEL_TAGS.has(root.tag)) {
      warnings.push({
        lineNumber: root.lineNumber,
        tag: root.tag,
        message: `未対応のレコード種別のため読み飛ばしました: ${root.tag}`,
      })
    }
  }

  const indiNodes = roots.filter((root) => root.tag === 'INDI')
  const famNodes = roots.filter((root) => root.tag === 'FAM')

  const xrefToPersonId = new Map<string, string>()
  const childPedigreeLookup = new Map<
    string,
    Map<string, PedigreeImportResult>
  >()
  const people: Person[] = []

  for (const indi of indiNodes) {
    const person = mapIndiToPerson(indi, version)
    people.push(person)
    if (indi.xref) {
      xrefToPersonId.set(indi.xref, person.id)
      childPedigreeLookup.set(indi.xref, extractFamcPedigrees(indi))
    }
  }

  const families = famNodes.map((fam) =>
    mapFamToFamily(fam, xrefToPersonId, childPedigreeLookup, warnings),
  )

  return {
    success: true,
    data: { people, families },
    version,
    encoding: decoded.encoding,
    warnings,
  }
}

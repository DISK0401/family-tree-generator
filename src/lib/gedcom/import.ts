import type {
  ChildLink,
  Family,
  FamilyEventType,
  FamilyId,
  FamilyKind,
  Gender,
  LifeEvent,
  Pedigree,
  Person,
  PersonId,
  TreeDocument,
} from '../../domain/types'
import { createTreeDocument, newId } from '../../domain/helpers'
import type { GedcomNode } from '../../domain/gedcomNode'
import { decodeGedcomBytes, type DetectedEncoding } from './encoding'
import { parseGedcomText } from './parser'
import { detectGedcomVersion, type GedcomVersion } from './version'
import { findChild, findChildren, pointerToXref } from './nodeHelpers'
import { gedcomNodeToPersonName } from './nameMapping'
import { gedcomNodeToFuzzyDate } from './dateMapping'
import { pediToPedigree } from './pedigree'

export interface ImportWarning {
  lineNumber?: number
  tag?: string
  message: string
}

export interface GedcomImportSuccess {
  success: true
  document: TreeDocument
  version: GedcomVersion
  encoding: DetectedEncoding
  warnings: ImportWarning[]
}

export interface GedcomImportFailure {
  success: false
  reason: string
}

export type GedcomImportResult = GedcomImportSuccess | GedcomImportFailure

const KNOWN_TOP_LEVEL_TAGS = new Set(['HEAD', 'TRLR', 'INDI', 'FAM'])

function mapGender(value: string | undefined): Gender {
  const normalized = value?.trim().toUpperCase()
  if (normalized === 'M') {
    return 'male'
  }
  if (normalized === 'F') {
    return 'female'
  }
  return 'unknown'
}

const NOTE_ORIGINAL_PREFIX = '元の表記: '

function mapLifeEvent<T extends string>(
  type: T,
  eventNode: GedcomNode,
): LifeEvent<T> {
  const dateNode = findChild(eventNode, 'DATE')
  let date = dateNode ? gedcomNodeToFuzzyDate(dateNode) : undefined

  if (date) {
    // 5.5.1エクスポート時、和暦原文はDATEのPHRASEではなく兄弟NOTEで保全している
    // (dateMapping.ts参照)。再インポート時はそちらを原文として優先する。
    const originalNote = findChildren(eventNode, 'NOTE')
      .map((note) => note.value)
      .find((value) => value?.startsWith(NOTE_ORIGINAL_PREFIX))
    if (originalNote) {
      date = {
        ...date,
        original: originalNote.slice(NOTE_ORIGINAL_PREFIX.length),
      }
    }
  }

  return {
    type,
    date,
    place: findChild(eventNode, 'PLAC')?.value,
  }
}

function joinNotes(node: GedcomNode): string | undefined {
  const notes = findChildren(node, 'NOTE')
    .map((note) => note.value)
    .filter((value): value is string => value !== undefined)
  return notes.length > 0 ? notes.join('\n') : undefined
}

function mapIndiToPerson(indi: GedcomNode): Person {
  const nameNode = findChild(indi, 'NAME')
  const birtNode = findChild(indi, 'BIRT')
  const deatNode = findChild(indi, 'DEAT')

  return {
    id: newId(),
    name: nameNode ? gedcomNodeToPersonName(nameNode) : {},
    gender: mapGender(findChild(indi, 'SEX')?.value),
    birth: birtNode ? mapLifeEvent('birth', birtNode) : undefined,
    death: deatNode ? mapLifeEvent('death', deatNode) : undefined,
    note: joinNotes(indi),
  }
}

function extractFamcPedigrees(indi: GedcomNode): Map<string, Pedigree> {
  const map = new Map<string, Pedigree>()
  for (const famc of findChildren(indi, 'FAMC')) {
    const famXref = pointerToXref(famc.value)
    if (!famXref) {
      continue
    }
    map.set(famXref, pediToPedigree(findChild(famc, 'PEDI')?.value))
  }
  return map
}

function mapFamToFamily(
  fam: GedcomNode,
  xrefToPersonId: Map<string, string>,
  childPedigreeLookup: Map<string, Map<string, Pedigree>>,
  warnings: ImportWarning[],
): Family {
  const husbXref = pointerToXref(findChild(fam, 'HUSB')?.value)
  const wifeXref = pointerToXref(findChild(fam, 'WIFE')?.value)

  const spouseIds = [husbXref, wifeXref]
    .filter((xref): xref is string => xref !== undefined)
    .map((xref) => xrefToPersonId.get(xref))
    .filter((id): id is string => id !== undefined)

  const events: LifeEvent<FamilyEventType>[] = []
  for (const marrNode of findChildren(fam, 'MARR')) {
    events.push(mapLifeEvent('marriage', marrNode))
  }
  for (const divNode of findChildren(fam, 'DIV')) {
    events.push(mapLifeEvent('divorce', divNode))
  }
  if (findChildren(fam, 'ANUL').length > 0) {
    warnings.push({
      tag: 'ANUL',
      message:
        '婚姻取消(ANUL)はこのアプリの続柄モデルに対応する種別がないため、離婚として取り込みました',
    })
    for (const anulNode of findChildren(fam, 'ANUL')) {
      events.push(mapLifeEvent('divorce', anulNode))
    }
  }

  const kindTag = findChild(fam, '_FAM_KIND')?.value
  const kind: FamilyKind =
    kindTag === 'married' || kindTag === 'common-law' || kindTag === 'unknown'
      ? kindTag
      : events.some((event) => event.type === 'marriage')
        ? 'married'
        : 'unknown'

  const famXref = fam.xref
  const children: ChildLink[] = findChildren(fam, 'CHIL').map((chilNode) => {
    const childXref = pointerToXref(chilNode.value)
    const personId = childXref ? xrefToPersonId.get(childXref) : undefined
    const pedigree =
      childXref && famXref
        ? childPedigreeLookup.get(childXref)?.get(famXref)
        : undefined

    if (!personId) {
      warnings.push({
        tag: 'CHIL',
        message: `子として参照されている人物が見つかりません(FAM @${famXref ?? '?'}@, 参照先 @${childXref ?? '?'}@)`,
      })
    }

    return {
      childId: personId ?? childXref ?? newId(),
      pedigree: pedigree ?? 'biological',
    }
  })

  return {
    id: newId(),
    spouseIds,
    kind,
    events,
    children,
  }
}

/**
 * GEDCOMファイルのバイト列をインポートする。文字コード判定→構文解析→
 * バージョン判定→意味層マッピングの順で処理し、ベストエフォートで
 * 警告付きインポートを成立させる。docs/gedcom-mapping.md の対応表に従い
 * TreeDocument(既存のfamily-data-modelケーパビリティ)へ変換する。
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
  const childPedigreeLookup = new Map<string, Map<string, Pedigree>>()
  const persons: Record<PersonId, Person> = {}

  for (const indi of indiNodes) {
    const person = mapIndiToPerson(indi)
    persons[person.id] = person
    if (indi.xref) {
      xrefToPersonId.set(indi.xref, person.id)
      childPedigreeLookup.set(indi.xref, extractFamcPedigrees(indi))
    }
  }

  const families: Record<FamilyId, Family> = {}
  for (const fam of famNodes) {
    const family = mapFamToFamily(
      fam,
      xrefToPersonId,
      childPedigreeLookup,
      warnings,
    )
    families[family.id] = family
  }

  const head = roots.find((root) => root.tag === 'HEAD')
  const title = head ? findChild(head, '_TREE_TITLE')?.value : undefined

  const document: TreeDocument = {
    ...createTreeDocument(title ? { title } : undefined),
    persons,
    families,
  }

  return {
    success: true,
    document,
    version,
    encoding: decoded.encoding,
    warnings,
  }
}

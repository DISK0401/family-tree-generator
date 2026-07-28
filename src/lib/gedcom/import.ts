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

/**
 * トップレベルで取り込む・または意図的に無視するレコード種別。
 * - HEAD/TRLR: ファイル構造上のレコード
 * - INDI/FAM: 取り込み対象
 * - SUBM: 提出者情報。本アプリの5.5.1エクスポートが必須要素として出力するが、
 *   モデルに対応項目がないため無警告でスキップする
 * これ以外(SOUR/OBJE/REPO等)は従来どおりレコード単位の警告を出して読み飛ばす。
 */
const KNOWN_TOP_LEVEL_TAGS = new Set(['HEAD', 'TRLR', 'INDI', 'FAM', 'SUBM'])

/**
 * INDI直下で取り込む・または意図的に無視する既知タグ。これ以外はレコード単位で
 * 集計して「読み飛ばしました」警告を出す(README「警告を出したうえで安全に
 * 読み飛ばされる」の実装)。
 * - NAME/SEX/BIRT/DEAT/NOTE/FAMC: モデルへ取り込む
 * - FAMS: FAMレコード側のHUSB/WIFEから復元できる冗長参照のため意図的に無視する
 */
const KNOWN_INDI_TAGS = new Set([
  'NAME',
  'SEX',
  'BIRT',
  'DEAT',
  'NOTE',
  'FAMC',
  'FAMS',
])

/** INDI直下のイベントタグ(この直下の未知タグも集計対象にする) */
const INDI_EVENT_TAGS = new Set(['BIRT', 'DEAT'])

/**
 * FAM直下で取り込む既知タグ。
 * - HUSB/WIFE/CHIL/MARR/DIV/ANUL: モデルへ取り込む
 * - _FAM_KIND/_SPOUSE_ROLE_UNKNOWN: 本アプリの独自拡張タグ
 */
const KNOWN_FAM_TAGS = new Set([
  'HUSB',
  'WIFE',
  'CHIL',
  'MARR',
  'DIV',
  'ANUL',
  '_FAM_KIND',
  '_SPOUSE_ROLE_UNKNOWN',
])

/** FAM直下のイベントタグ(この直下の未知タグも集計対象にする) */
const FAM_EVENT_TAGS = new Set(['MARR', 'DIV', 'ANUL'])

/**
 * 取り込むイベント(BIRT/DEAT/MARR/DIV/ANUL)直下の既知タグ。
 * - DATE/PLAC: モデルへ取り込む
 * - NOTE: 5.5.1エクスポートの和暦原文NOTE(「元の表記: 」)として解釈を試みる
 */
const KNOWN_EVENT_TAGS = new Set(['DATE', 'PLAC', 'NOTE'])

/** ImportResultへ載せる警告件数の上限。超過分は件数のみ通知する */
const MAX_IMPORT_WARNINGS = 100

/** 未対応タグの集計警告で列挙するタグ名の上限 */
const UNKNOWN_TAG_LIST_LIMIT = 3

/**
 * レコード直下(および取り込むイベント直下)の未知タグをレコード単位で集計し、
 * 「@I1@: OCCU, RESI など3項目を読み飛ばしました」形式の警告を1件にまとめる。
 */
function summarizeUnknownTags(
  record: GedcomNode,
  knownTags: Set<string>,
  eventTags: Set<string>,
  warnings: ImportWarning[],
): void {
  const skipped: string[] = []
  for (const child of record.children) {
    if (!knownTags.has(child.tag)) {
      skipped.push(child.tag)
    } else if (eventTags.has(child.tag)) {
      for (const grandChild of child.children) {
        if (!KNOWN_EVENT_TAGS.has(grandChild.tag)) {
          skipped.push(`${child.tag}>${grandChild.tag}`)
        }
      }
    }
  }
  if (skipped.length === 0) {
    return
  }
  const distinct = [...new Set(skipped)]
  const listed = distinct.slice(0, UNKNOWN_TAG_LIST_LIMIT).join(', ')
  const hasMore =
    distinct.length > UNKNOWN_TAG_LIST_LIMIT || skipped.length > distinct.length
  const label = record.xref ? `@${record.xref}@` : `${record.tag}レコード`
  warnings.push({
    lineNumber: record.lineNumber,
    tag: record.tag,
    message: `${label}: ${listed} ${hasMore ? 'など' : 'の'}${skipped.length}項目を読み飛ばしました`,
  })
}

function mapGender(indi: GedcomNode, warnings: ImportWarning[]): Gender {
  const sexNode = findChild(indi, 'SEX')
  const normalized = sexNode?.value?.trim().toUpperCase()
  if (normalized === 'M') {
    return 'male'
  }
  if (normalized === 'F') {
    return 'female'
  }
  // GEDCOM 7.0のX(男女いずれにも当てはまらない)はモデルに対応値がないため
  // 不明として取り込み、その旨を知らせる
  if (normalized === 'X') {
    warnings.push({
      lineNumber: sexNode?.lineNumber,
      tag: 'SEX',
      message: `性別 X は『不明』として取り込みました(@${indi.xref ?? '?'}@)`,
    })
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

function mapIndiToPerson(indi: GedcomNode, warnings: ImportWarning[]): Person {
  const nameNode = findChild(indi, 'NAME')
  const birtNode = findChild(indi, 'BIRT')
  const deatNode = findChild(indi, 'DEAT')

  return {
    id: newId(),
    name: nameNode ? gedcomNodeToPersonName(nameNode) : {},
    gender: mapGender(indi, warnings),
    birth: birtNode ? mapLifeEvent('birth', birtNode) : undefined,
    death: deatNode ? mapLifeEvent('death', deatNode) : undefined,
    note: joinNotes(indi),
  }
}

function extractFamcPedigrees(
  indi: GedcomNode,
  warnings: ImportWarning[],
): Map<string, Pedigree> {
  const map = new Map<string, Pedigree>()
  for (const famc of findChildren(indi, 'FAMC')) {
    const famXref = pointerToXref(famc.value)
    if (!famXref) {
      continue
    }
    const pediNode = findChild(famc, 'PEDI')
    if (pediNode?.value?.trim().toUpperCase() === 'SEALING') {
      // SEALINGは特定宗派の儀式上の続柄で、本モデルに対応する種別がない
      warnings.push({
        lineNumber: pediNode.lineNumber,
        tag: 'PEDI',
        message: `続柄 SEALING は『不明』として取り込みました(@${indi.xref ?? '?'}@)`,
      })
    }
    map.set(famXref, pediToPedigree(pediNode?.value))
  }
  return map
}

function mapFamToFamily(
  fam: GedcomNode,
  xrefToPersonId: Map<string, string>,
  childPedigreeLookup: Map<string, Map<string, Pedigree>>,
  warnings: ImportWarning[],
): Family {
  const famXref = fam.xref
  const famLabel = `FAM @${famXref ?? '?'}@`

  // HUSB/WIFE: 参照先が解決できないものはリンクとして取り込まず警告する。
  // 同一人物を重複して指す場合(HUSBとWIFEが同じ等)は1名にまとめる。
  const spouseIds: string[] = []
  for (const tag of ['HUSB', 'WIFE'] as const) {
    for (const node of findChildren(fam, tag)) {
      const pointer = node.value?.trim()
      const xref = pointerToXref(pointer)
      const personId = xref ? xrefToPersonId.get(xref) : undefined
      if (!personId) {
        warnings.push({
          lineNumber: node.lineNumber,
          tag,
          message: `${pointer ?? '(値なし)'} が見つからないため、配偶者として取り込みませんでした(${famLabel})`,
        })
        continue
      }
      if (spouseIds.includes(personId)) {
        warnings.push({
          lineNumber: node.lineNumber,
          tag,
          message: `HUSB/WIFEが同一人物 ${pointer} を参照しているため、1名の配偶者として取り込みました(${famLabel})`,
        })
        continue
      }
      spouseIds.push(personId)
    }
  }

  const spouseRoleUnknownNode = findChild(fam, '_SPOUSE_ROLE_UNKNOWN')
  if (spouseRoleUnknownNode) {
    warnings.push({
      lineNumber: spouseRoleUnknownNode.lineNumber,
      tag: '_SPOUSE_ROLE_UNKNOWN',
      message: `配偶者の続柄(夫/妻)が確定していないデータです(${famLabel})`,
    })
  }

  // FAM配下を文書順に走査してイベントを積む。タグ別にまとめて走査すると
  // 復縁(婚姻→離婚→婚姻)の時系列が壊れるため。
  const events: LifeEvent<FamilyEventType>[] = []
  let anulWarned = false
  for (const node of fam.children) {
    if (node.tag === 'MARR') {
      events.push(mapLifeEvent('marriage', node))
    } else if (node.tag === 'DIV') {
      events.push(mapLifeEvent('divorce', node))
    } else if (node.tag === 'ANUL') {
      if (!anulWarned) {
        warnings.push({
          lineNumber: node.lineNumber,
          tag: 'ANUL',
          message:
            '婚姻取消(ANUL)はこのアプリの続柄モデルに対応する種別がないため、離婚として取り込みました',
        })
        anulWarned = true
      }
      events.push(mapLifeEvent('divorce', node))
    }
  }

  const kindTag = findChild(fam, '_FAM_KIND')?.value
  const kind: FamilyKind =
    kindTag === 'married' || kindTag === 'common-law' || kindTag === 'unknown'
      ? kindTag
      : events.some((event) => event.type === 'marriage')
        ? 'married'
        : 'unknown'

  // CHIL: 参照先が解決できないものは親子関係として取り込まず警告する。
  // 同一の子への重複参照は1件にまとめる。
  const children: ChildLink[] = []
  const seenChildIds = new Set<string>()
  for (const chilNode of findChildren(fam, 'CHIL')) {
    const pointer = chilNode.value?.trim()
    const childXref = pointerToXref(pointer)
    const personId = childXref ? xrefToPersonId.get(childXref) : undefined
    if (!personId) {
      warnings.push({
        lineNumber: chilNode.lineNumber,
        tag: 'CHIL',
        message: `${pointer ?? '(値なし)'} が見つからないため、この親子関係は取り込みませんでした(${famLabel})`,
      })
      continue
    }
    if (seenChildIds.has(personId)) {
      warnings.push({
        lineNumber: chilNode.lineNumber,
        tag: 'CHIL',
        message: `同じ子 ${pointer} への参照が重複しているため、1件にまとめました(${famLabel})`,
      })
      continue
    }
    seenChildIds.add(personId)
    const pedigree =
      childXref && famXref
        ? childPedigreeLookup.get(childXref)?.get(famXref)
        : undefined
    children.push({
      childId: personId,
      pedigree: pedigree ?? 'biological',
    })
  }

  return {
    id: newId(),
    spouseIds,
    kind,
    events,
    children,
  }
}

/** 警告を上限件数で打ち切り、超過分は件数のみを末尾に足す。 */
function capWarnings(warnings: ImportWarning[]): ImportWarning[] {
  if (warnings.length <= MAX_IMPORT_WARNINGS) {
    return warnings
  }
  const capped = warnings.slice(0, MAX_IMPORT_WARNINGS)
  capped.push({
    message: `ほか ${warnings.length - MAX_IMPORT_WARNINGS} 件の警告があります`,
  })
  return capped
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

  const warnings: ImportWarning[] = [
    ...decoded.warnings.map((message) => ({ message })),
    ...parseWarnings.map((warning) => ({
      lineNumber: warning.lineNumber,
      message: warning.message,
    })),
  ]

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
    const person = mapIndiToPerson(indi, warnings)
    if (indi.xref) {
      const existingId = xrefToPersonId.get(indi.xref)
      if (existingId !== undefined) {
        // 同一xrefの再定義は後勝ちとし、先の定義を破棄する
        delete persons[existingId]
        warnings.push({
          lineNumber: indi.lineNumber,
          tag: 'INDI',
          message: `@${indi.xref}@ が複数回定義されているため、後の定義を採用しました`,
        })
      }
      xrefToPersonId.set(indi.xref, person.id)
      childPedigreeLookup.set(indi.xref, extractFamcPedigrees(indi, warnings))
    }
    persons[person.id] = person
    summarizeUnknownTags(indi, KNOWN_INDI_TAGS, INDI_EVENT_TAGS, warnings)
  }

  const families: Record<FamilyId, Family> = {}
  const famXrefToFamilyId = new Map<string, string>()
  for (const fam of famNodes) {
    const family = mapFamToFamily(
      fam,
      xrefToPersonId,
      childPedigreeLookup,
      warnings,
    )
    if (fam.xref) {
      const existingId = famXrefToFamilyId.get(fam.xref)
      if (existingId !== undefined) {
        delete families[existingId]
        warnings.push({
          lineNumber: fam.lineNumber,
          tag: 'FAM',
          message: `@${fam.xref}@ が複数回定義されているため、後の定義を採用しました`,
        })
      }
      famXrefToFamilyId.set(fam.xref, family.id)
    }
    families[family.id] = family
    summarizeUnknownTags(fam, KNOWN_FAM_TAGS, FAM_EVENT_TAGS, warnings)
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
    warnings: capWarnings(warnings),
  }
}

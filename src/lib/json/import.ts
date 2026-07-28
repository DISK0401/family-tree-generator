import { z } from 'zod'
import {
  SCHEMA_VERSION,
  type ChildLink,
  type Family,
  type FuzzyDate,
  type Person,
  type PersonId,
  type TreeDocument,
} from '../../domain/types'
import { treeDocumentSchema } from './schema'

export interface JsonImportSuccess {
  success: true
  document: TreeDocument
  /** 警告付き修復(参照切れリンクの除去・重複の統合など)の内容。空配列なら無修復 */
  warnings: string[]
}

export interface JsonImportFailure {
  success: false
  reason: string
}

export type JsonImportResult = JsonImportSuccess | JsonImportFailure

const versionProbeSchema = z
  .object({ schemaVersion: z.unknown().optional() })
  .loose()

/** ImportResultへ載せる警告件数の上限。超過分は件数のみ通知する */
const MAX_IMPORT_WARNINGS = 100

function capWarnings(warnings: string[]): string[] {
  if (warnings.length <= MAX_IMPORT_WARNINGS) {
    return warnings
  }
  const capped = warnings.slice(0, MAX_IMPORT_WARNINGS)
  capped.push(
    `ほか ${warnings.length - MAX_IMPORT_WARNINGS} 件の警告があります`,
  )
  return capped
}

/**
 * qualifier 'between' ⇔ date2 の相関を修復する。betweenなのにdate2が無い日付は
 * 期間として解釈できないため、警告付きで単一日付(exact)へ降格する。
 */
function repairFuzzyDate(
  date: FuzzyDate | undefined,
  context: string,
  warnings: string[],
): FuzzyDate | undefined {
  if (date && date.qualifier === 'between' && date.date2 === undefined) {
    warnings.push(
      `${context}: 期間指定(between)なのに終端日付(date2)がないため、単一日付として取り込みました`,
    )
    return { ...date, qualifier: 'exact' }
  }
  return date
}

function repairPerson(person: Person, warnings: string[]): Person {
  const birthDate = repairFuzzyDate(
    person.birth?.date,
    `人物 ${person.id} の出生日`,
    warnings,
  )
  const deathDate = repairFuzzyDate(
    person.death?.date,
    `人物 ${person.id} の死亡日`,
    warnings,
  )
  return {
    ...person,
    birth: person.birth ? { ...person.birth, date: birthDate } : undefined,
    death: person.death ? { ...person.death, date: deathDate } : undefined,
  }
}

function repairFamily(
  family: Family,
  persons: Record<PersonId, Person>,
  warnings: string[],
): Family {
  // 参照切れは「エラーで拒否」ではなく警告付き修復とする。過去のエクスポートが
  // ダングリング参照を含み得るため、該当リンクのみ除去してデータ本体は救う。
  const spouseIds: PersonId[] = []
  for (const spouseId of family.spouseIds) {
    if (!persons[spouseId]) {
      warnings.push(
        `家族 ${family.id}: 存在しない人物 ${spouseId} への配偶者参照を除去しました`,
      )
      continue
    }
    if (spouseIds.includes(spouseId)) {
      warnings.push(
        `家族 ${family.id}: 重複する配偶者参照 ${spouseId} を1件にまとめました`,
      )
      continue
    }
    spouseIds.push(spouseId)
  }

  const children: ChildLink[] = []
  const seenChildIds = new Set<PersonId>()
  for (const link of family.children) {
    if (!persons[link.childId]) {
      warnings.push(
        `家族 ${family.id}: 存在しない人物 ${link.childId} への子参照を除去しました`,
      )
      continue
    }
    if (seenChildIds.has(link.childId)) {
      warnings.push(
        `家族 ${family.id}: 重複する子参照 ${link.childId} を1件にまとめました`,
      )
      continue
    }
    seenChildIds.add(link.childId)
    children.push(link)
  }

  const events = family.events.map((event, index) => ({
    ...event,
    date: repairFuzzyDate(
      event.date,
      `家族 ${family.id} のイベント${index + 1}`,
      warnings,
    ),
  }))

  return { ...family, spouseIds, children, events }
}

/** ドキュメントレベルの整合性を警告付きで修復する(スキーマ検証の後段)。 */
function repairDocument(document: TreeDocument): {
  document: TreeDocument
  warnings: string[]
} {
  const warnings: string[] = []

  const persons: Record<PersonId, Person> = {}
  for (const [key, person] of Object.entries(document.persons)) {
    persons[key] = repairPerson(person, warnings)
  }

  const families: TreeDocument['families'] = {}
  for (const [key, family] of Object.entries(document.families)) {
    families[key] = repairFamily(family, persons, warnings)
  }

  return { document: { ...document, persons, families }, warnings }
}

/**
 * ネイティブJSON形式をインポートする。schemaVersionの欠落・未知バージョン・
 * スキーマ不一致の場合はインポートを中断し、既存データは変更しない。
 * 参照切れ・重複などの修復可能な不整合は警告付きで修復して取り込む。
 */
export function importFamilyTreeJson(text: string): JsonImportResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return {
      success: false,
      reason: 'JSONとして読み込めませんでした(構文が不正です)',
    }
  }

  const probe = versionProbeSchema.safeParse(parsed)
  if (!probe.success) {
    return { success: false, reason: 'JSONファイルの構造が不正です' }
  }

  const version = probe.data.schemaVersion
  if (version === undefined) {
    return {
      success: false,
      reason:
        'schemaVersionが見つかりません。本アプリでエクスポートしたファイルではない可能性があります',
    }
  }

  // 数値でないschemaVersionは「新しいバージョン」ではなく形式そのものの不正として区別する
  if (typeof version !== 'number') {
    return {
      success: false,
      reason: `schemaVersionが数値ではありません(${JSON.stringify(version)})。ファイルが破損しているか、本アプリ以外で生成された可能性があります`,
    }
  }

  if (version === SCHEMA_VERSION) {
    const result = treeDocumentSchema.safeParse(parsed)
    if (!result.success) {
      const details = result.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join(', ')
      return {
        success: false,
        reason: `JSONファイルの内容が不正です(${details})`,
      }
    }
    const repaired = repairDocument(result.data)
    return {
      success: true,
      document: repaired.document,
      warnings: capWarnings(repaired.warnings),
    }
  }

  return {
    success: false,
    reason: `未対応のschemaVersionです(${String(version)})。新しいバージョンのアプリでエクスポートされた可能性があります`,
  }
}

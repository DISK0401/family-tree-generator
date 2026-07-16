/**
 * 家系図ドメインモデル
 *
 * GEDCOM 7.0 の INDI / FAM 2レコード構造へ無損失マッピング可能な項目定義とする。
 * 対応表は docs/gedcom-mapping.md を参照。
 * 名前・日付の原文(旧字体・和暦)は正規化せずそのまま保持する。
 */

export type PersonId = string
export type FamilyId = string

export type Gender = 'male' | 'female' | 'unknown'

/** 構造化された名前。各フィールドは入力原文のまま保持する(旧字体・異体字を正規化しない) */
export interface PersonName {
  surname?: string
  given?: string
  surnameKana?: string
  givenKana?: string
}

/** GEDCOM DATE修飾子(ABT/BEF/AFT/BET)相当 */
export type DateQualifier = 'exact' | 'about' | 'before' | 'after' | 'between'

/** グレゴリオ暦の部分日付(年のみ・年月のみを許容) */
export interface CalendarDate {
  year: number
  month?: number
  day?: number
}

/** 不確実さを表現できる日付。original には和暦を含む入力原文を保持する */
export interface FuzzyDate {
  original: string
  qualifier: DateQualifier
  date?: CalendarDate
  /** qualifier === 'between' の終端 */
  date2?: CalendarDate
}

export type PersonEventType = 'birth' | 'death'
export type FamilyEventType = 'marriage' | 'divorce'

/** 日付+場所のイベント(GEDCOM BIRT/DEAT/MARR/DIV相当) */
export interface LifeEvent<T extends string = string> {
  type: T
  date?: FuzzyDate
  place?: string
}

/** 個人(GEDCOM INDI相当) */
export interface Person {
  id: PersonId
  name: PersonName
  gender: Gender
  birth?: LifeEvent<'birth'>
  death?: LifeEvent<'death'>
  note?: string
}

/** 続柄種別(GEDCOM PEDI相当) */
export type Pedigree = 'biological' | 'adopted' | 'step' | 'foster' | 'unknown'

/** 家族への子の帰属 */
export interface ChildLink {
  childId: PersonId
  pedigree: Pedigree
}

export type FamilyKind = 'married' | 'common-law' | 'unknown'

/**
 * 家族=婚姻単位(GEDCOM FAM相当)。
 * events は時系列リストで、同一相手との復縁(婚姻→離婚→婚姻)を1つのFamilyで表現する。
 * 配偶者は1名でも成立する(ひとり親)。
 */
export interface Family {
  id: FamilyId
  spouseIds: PersonId[]
  kind: FamilyKind
  events: LifeEvent<FamilyEventType>[]
  children: ChildLink[]
}

/** 現行スキーマバージョン。モデル構造の変更時に必ずインクリメントする */
export const SCHEMA_VERSION = 1

/** 家系図全体の保存単位 */
export interface TreeDocument {
  schemaVersion: number
  id: string
  title: string
  updatedAt: string
  persons: Record<PersonId, Person>
  families: Record<FamilyId, Family>
}

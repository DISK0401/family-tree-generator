import type {
  CalendarDate,
  Family,
  FamilyEventType,
  FuzzyDate,
  LifeEvent,
  Person,
  PersonName,
  TreeDocument,
} from './types'
import { SCHEMA_VERSION } from './types'

export function newId(): string {
  return crypto.randomUUID()
}

/**
 * 名前以外は不明のままでも人物として成立させる。
 * 必須フィールドの既定値は`??`で補う。`{ gender: undefined }`のように呼び出し側が
 * 明示的にundefinedを渡した場合(スプレッドで組んだinitに生じがち)でも、
 * スプレッドの後勝ちで既定値が潰れて不正なPersonができないようにするため
 */
export function createPerson(
  init: { name: PersonName } & Partial<Omit<Person, 'id' | 'name'>>,
): Person {
  return {
    id: newId(),
    ...init,
    gender: init.gender ?? 'unknown',
  }
}

/** 必須フィールドを`??`で補う理由は`createPerson`と同じ(明示undefinedへの防御) */
export function createFamily(
  init: { spouseIds: Family['spouseIds'] } & Partial<
    Omit<Family, 'id' | 'spouseIds'>
  >,
): Family {
  return {
    id: newId(),
    ...init,
    kind: init.kind ?? 'unknown',
    events: init.events ?? [],
    children: init.children ?? [],
  }
}

export function createTreeDocument(
  init?: Partial<Pick<TreeDocument, 'id' | 'title'>>,
): TreeDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: init?.id ?? newId(),
    title: init?.title ?? '無題の家系図',
    updatedAt: new Date().toISOString(),
    persons: {},
    families: {},
  }
}

/** 表示名(姓+名)。どちらか一方でも成立する */
export function displayName(person: Person): string {
  const parts = [person.name.surname, person.name.given].filter(Boolean)
  return parts.join(' ') || '(名前未設定)'
}

function dateSortKey(d: CalendarDate | undefined): number {
  if (!d) return Number.POSITIVE_INFINITY
  return d.year * 10000 + (d.month ?? 0) * 100 + (d.day ?? 0)
}

/**
 * 日付なしは末尾へ、同順位は0を返す比較器。
 * キーの引き算では両方日付なしのときにInfinity−Infinity=NaNとなり、
 * Array.prototype.sortの比較器として一貫しない(挙動が処理系任せになる)ため、
 * 比較で-1/0/1を返す
 */
export function compareFuzzyDate(
  a: FuzzyDate | undefined,
  b: FuzzyDate | undefined,
): number {
  const keyA = dateSortKey(a?.date)
  const keyB = dateSortKey(b?.date)
  if (keyA === keyB) return 0
  return keyA < keyB ? -1 : 1
}

/** 家族のイベントを日付順(日付なしは末尾、同順位は登録順)で返す */
export function familyEventsInOrder(
  family: Family,
): LifeEvent<FamilyEventType>[] {
  return [...family.events].sort((a, b) => compareFuzzyDate(a.date, b.date))
}

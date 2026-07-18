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

/** 名前以外は不明のままでも人物として成立させる */
export function createPerson(init: { name: PersonName } & Partial<Omit<Person, 'id' | 'name'>>): Person {
  return {
    id: newId(),
    gender: 'unknown',
    ...init,
  }
}

export function createFamily(init: { spouseIds: Family['spouseIds'] } & Partial<Omit<Family, 'id' | 'spouseIds'>>): Family {
  return {
    id: newId(),
    kind: 'unknown',
    events: [],
    children: [],
    ...init,
  }
}

export function createTreeDocument(init?: Partial<Pick<TreeDocument, 'id' | 'title'>>): TreeDocument {
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

export function compareFuzzyDate(a: FuzzyDate | undefined, b: FuzzyDate | undefined): number {
  return dateSortKey(a?.date) - dateSortKey(b?.date)
}

/** 家族のイベントを日付順(日付なしは末尾、同順位は登録順)で返す */
export function familyEventsInOrder(family: Family): LifeEvent<FamilyEventType>[] {
  return [...family.events].sort((a, b) => compareFuzzyDate(a.date, b.date))
}

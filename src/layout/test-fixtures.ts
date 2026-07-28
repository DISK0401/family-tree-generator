import type { Family, Person, PersonId, TreeDocument } from '../domain/types'

/**
 * レイアウタのテスト専用フィクスチャ。人物IDを`'a'`のような短い固定文字列で直接指定できるようにし、
 * `TreeDocument`を毎回手で組み立てる手間を省く。ドメイン層の`createPerson`/`createFamily`
 * (src/domain/helpers.ts)はUUIDを生成するため、期待値の記述がしやすい固定IDが要るテストには使わない
 */

export function person(
  id: PersonId,
  given: string,
  gender: Person['gender'] = 'unknown',
): Person {
  return { id, name: { given }, gender }
}

export function family(
  id: string,
  spouseIds: PersonId[],
  children: Family['children'] = [],
): Family {
  return { id, spouseIds, kind: 'unknown', events: [], children }
}

export function testDoc(persons: Person[], families: Family[]): TreeDocument {
  return {
    schemaVersion: 1,
    id: 'test-doc',
    title: 'テスト用ドキュメント',
    updatedAt: new Date(0).toISOString(),
    persons: Object.fromEntries(persons.map((p) => [p.id, p])),
    families: Object.fromEntries(families.map((f) => [f.id, f])),
  }
}

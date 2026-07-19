import { createFamily, createPerson } from './helpers'
import type {
  Family,
  FamilyEventType,
  FamilyId,
  FamilyKind,
  LifeEvent,
  Pedigree,
  Person,
  PersonId,
  PersonName,
  TreeDocument,
} from './types'

/**
 * ドメインコマンド群。すべて純関数で、入力のTreeDocumentを変更せず新しいドキュメントを返す。
 * ストア(undo/redo)はこれらの戻り値をスナップショットとして扱う。
 */

export type PersonInit = { name: PersonName } & Partial<Omit<Person, 'id' | 'name'>>

function touch(doc: TreeDocument): TreeDocument {
  return { ...doc, updatedAt: new Date().toISOString() }
}

function putPerson(doc: TreeDocument, person: Person): TreeDocument {
  return { ...doc, persons: { ...doc.persons, [person.id]: person } }
}

function putFamily(doc: TreeDocument, family: Family): TreeDocument {
  return { ...doc, families: { ...doc.families, [family.id]: family } }
}

export function addPerson(
  doc: TreeDocument,
  init: PersonInit,
): { doc: TreeDocument; personId: PersonId } {
  const person = createPerson(init)
  return { doc: touch(putPerson(doc, person)), personId: person.id }
}

export function updatePerson(
  doc: TreeDocument,
  personId: PersonId,
  patch: Partial<Omit<Person, 'id'>>,
): TreeDocument {
  const person = doc.persons[personId]
  if (!person) throw new Error(`人物が見つかりません: ${personId}`)
  return touch(putPerson(doc, { ...person, ...patch }))
}

/** 配偶者を新規作成して家族(婚姻単位)を新設する。既存の家族はそのまま残る(再婚対応) */
export function addSpouse(
  doc: TreeDocument,
  personId: PersonId,
  spouseInit: PersonInit,
  kind: FamilyKind = 'unknown',
): { doc: TreeDocument; spouseId: PersonId; familyId: FamilyId } {
  if (!doc.persons[personId]) throw new Error(`人物が見つかりません: ${personId}`)
  const spouse = createPerson(spouseInit)
  const family = createFamily({ spouseIds: [personId, spouse.id], kind })
  let next = putPerson(doc, spouse)
  next = putFamily(next, family)
  return { doc: touch(next), spouseId: spouse.id, familyId: family.id }
}

/** 指定人物(と任意の配偶者)の家族へ子を新規作成して帰属させる。該当する家族がなければ新設する */
export function addChild(
  doc: TreeDocument,
  parentId: PersonId,
  childInit: PersonInit,
  options?: { otherParentId?: PersonId; pedigree?: Pedigree },
): { doc: TreeDocument; childId: PersonId; familyId: FamilyId } {
  if (!doc.persons[parentId]) throw new Error(`人物が見つかりません: ${parentId}`)
  const pedigree = options?.pedigree ?? 'biological'
  const otherParentId = options?.otherParentId

  let family = Object.values(doc.families).find((f) =>
    otherParentId
      ? f.spouseIds.includes(parentId) && f.spouseIds.includes(otherParentId)
      : f.spouseIds.length === 1 && f.spouseIds[0] === parentId,
  )

  const child = createPerson(childInit)
  let next = putPerson(doc, child)
  if (!family) {
    family = createFamily({
      spouseIds: otherParentId ? [parentId, otherParentId] : [parentId],
    })
  }
  next = putFamily(next, {
    ...family,
    children: [...family.children, { childId: child.id, pedigree }],
  })
  return { doc: touch(next), childId: child.id, familyId: family.id }
}

/** 既存人物を既存の家族へ子として帰属させる(養子縁組など) */
export function addChildLink(
  doc: TreeDocument,
  familyId: FamilyId,
  childId: PersonId,
  pedigree: Pedigree,
): TreeDocument {
  const family = doc.families[familyId]
  if (!family) throw new Error(`家族が見つかりません: ${familyId}`)
  if (!doc.persons[childId]) throw new Error(`人物が見つかりません: ${childId}`)
  if (family.children.some((c) => c.childId === childId)) return doc
  return touch(
    putFamily(doc, { ...family, children: [...family.children, { childId, pedigree }] }),
  )
}

/** 親のいない人物へ親を新規作成する。2人目の親は既存のひとり親家族へ加わる */
export function addParent(
  doc: TreeDocument,
  childId: PersonId,
  parentInit: PersonInit,
): { doc: TreeDocument; parentId: PersonId; familyId: FamilyId } {
  if (!doc.persons[childId]) throw new Error(`人物が見つかりません: ${childId}`)
  const parent = createPerson(parentInit)
  let next = putPerson(doc, parent)

  const existing = Object.values(doc.families).find(
    (f) => f.children.some((c) => c.childId === childId) && f.spouseIds.length === 1,
  )
  if (existing) {
    next = putFamily(next, { ...existing, spouseIds: [...existing.spouseIds, parent.id] })
    return { doc: touch(next), parentId: parent.id, familyId: existing.id }
  }

  const family = createFamily({
    spouseIds: [parent.id],
    children: [{ childId, pedigree: 'biological' }],
  })
  next = putFamily(next, family)
  return { doc: touch(next), parentId: parent.id, familyId: family.id }
}

export function setChildPedigree(
  doc: TreeDocument,
  familyId: FamilyId,
  childId: PersonId,
  pedigree: Pedigree,
): TreeDocument {
  const family = doc.families[familyId]
  if (!family) throw new Error(`家族が見つかりません: ${familyId}`)
  return touch(
    putFamily(doc, {
      ...family,
      children: family.children.map((c) => (c.childId === childId ? { ...c, pedigree } : c)),
    }),
  )
}

/** 婚姻・離婚イベントを追記する(時系列リスト。復縁は同一Familyへの2度目の婚姻イベント) */
export function addFamilyEvent(
  doc: TreeDocument,
  familyId: FamilyId,
  event: LifeEvent<FamilyEventType>,
): TreeDocument {
  const family = doc.families[familyId]
  if (!family) throw new Error(`家族が見つかりません: ${familyId}`)
  return touch(putFamily(doc, { ...family, events: [...family.events, event] }))
}

/**
 * 指定種別(婚姻/離婚)の最初の1件を置換・新規追加・削除(`event`が`undefined`)する。
 * UIからの単純な「その家族の婚姻日を設定/更新/削除する」操作用。2件目以降(復縁等)は
 * 対象にせずそのまま保持する(design.md D3)。複数件を意図的に扱う経路は`addFamilyEvent`を使う
 */
export function setFamilyEvent(
  doc: TreeDocument,
  familyId: FamilyId,
  type: FamilyEventType,
  event: LifeEvent<FamilyEventType> | undefined,
): TreeDocument {
  const family = doc.families[familyId]
  if (!family) throw new Error(`家族が見つかりません: ${familyId}`)
  const index = family.events.findIndex((e) => e.type === type)
  let events: LifeEvent<FamilyEventType>[]
  if (event === undefined) {
    events = index === -1 ? family.events : family.events.filter((_, i) => i !== index)
  } else if (index === -1) {
    events = [...family.events, event]
  } else {
    events = family.events.map((e, i) => (i === index ? event : e))
  }
  return touch(putFamily(doc, { ...family, events }))
}

export function updateFamily(
  doc: TreeDocument,
  familyId: FamilyId,
  patch: Partial<Omit<Family, 'id'>>,
): TreeDocument {
  const family = doc.families[familyId]
  if (!family) throw new Error(`家族が見つかりません: ${familyId}`)
  return touch(putFamily(doc, { ...family, ...patch }))
}

export interface RemovalImpact {
  /** 配偶者として属している家族の数 */
  spouseFamilyCount: number
  /** 子として帰属しているリンクの数 */
  childLinkCount: number
  /** この人物の削除に伴い削除される家族の数 */
  removedFamilyCount: number
}

/** 削除確認ダイアログ用: 人物削除の影響範囲を返す */
export function computeRemovalImpact(doc: TreeDocument, personId: PersonId): RemovalImpact {
  const families = Object.values(doc.families)
  const spouseFamilies = families.filter((f) => f.spouseIds.includes(personId))
  const childLinks = families.filter((f) => f.children.some((c) => c.childId === personId))
  const removedFamilies = spouseFamilies.filter(
    (f) => f.spouseIds.length === 1 || (f.spouseIds.length === 2 && f.children.length === 0),
  )
  return {
    spouseFamilyCount: spouseFamilies.length,
    childLinkCount: childLinks.length,
    removedFamilyCount: removedFamilies.filter(
      (f) => !(f.spouseIds.length === 2 && f.children.length > 0),
    ).length,
  }
}

/**
 * 人物を削除し、関係の整合を保つ。
 * - 配偶者として属す家族から除く。配偶者が誰もいなくなった家族は子の有無に関わらず削除
 *   (残る子は親リンクを失うだけで人物としては残る)
 * - 子として帰属するリンクを除く
 */
export function removePerson(doc: TreeDocument, personId: PersonId): TreeDocument {
  if (!doc.persons[personId]) throw new Error(`人物が見つかりません: ${personId}`)
  const persons = { ...doc.persons }
  delete persons[personId]

  const families: TreeDocument['families'] = {}
  for (const family of Object.values(doc.families)) {
    const spouseIds = family.spouseIds.filter((id) => id !== personId)
    const children = family.children.filter((c) => c.childId !== personId)
    const wasSpouse = spouseIds.length !== family.spouseIds.length
    if (wasSpouse && spouseIds.length === 0) continue
    if (spouseIds.length === 0 && children.length === 0) continue
    families[family.id] = { ...family, spouseIds, children }
  }
  return touch({ ...doc, persons, families })
}

export function removeFamily(doc: TreeDocument, familyId: FamilyId): TreeDocument {
  if (!doc.families[familyId]) throw new Error(`家族が見つかりません: ${familyId}`)
  const families = { ...doc.families }
  delete families[familyId]
  return touch({ ...doc, families })
}

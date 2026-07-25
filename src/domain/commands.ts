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

/**
 * 既存人物を既存の家族へ2人目の配偶者として加える。親子関係と婚姻関係が別々の家族に
 * 分かれて記録された状態を、利用者の明示的な操作で1つの家族へ統合するための経路
 * (spec family-data-model「既存の家族への配偶者の追加」)。
 * `addSpouse`は常に新しい家族を作る(再婚対応)ため、既存家族への合流はこちらを使う。
 * 継親・後妻を子の親として誤って記録しないよう、推測による自動合流は行わない(design.md D5)
 */
export function addSpouseLink(
  doc: TreeDocument,
  familyId: FamilyId,
  personId: PersonId,
): TreeDocument {
  const family = doc.families[familyId]
  if (!family) throw new Error(`家族が見つかりません: ${familyId}`)
  if (!doc.persons[personId]) throw new Error(`人物が見つかりません: ${personId}`)
  if (family.spouseIds.includes(personId)) return doc
  if (family.spouseIds.length >= 2) throw new Error(`配偶者は2人までです: ${familyId}`)
  if (family.children.some((c) => c.childId === personId)) {
    throw new Error(`家族の子を配偶者にはできません: ${personId}`)
  }
  return touch(putFamily(doc, { ...family, spouseIds: [...family.spouseIds, personId] }))
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

/**
 * 家族として意味を成さないか。配偶者が誰もいない家族は子の有無に関わらず、
 * 配偶者が1人だけの家族は子もいない場合に、婚姻単位としても親子関係の器としても
 * 成立しない(spec family-data-model「家族(婚姻単位)の表現」)。
 * 配偶者2人・子0人(子のいない夫婦)と、配偶者1人・子あり(ひとり親)はいずれも正当な状態
 */
function isVacantFamily(family: Pick<Family, 'spouseIds' | 'children'>): boolean {
  if (family.spouseIds.length === 0) return true
  return family.spouseIds.length === 1 && family.children.length === 0
}

/**
 * 人物削除後のfamiliesと、その過程で削除される家族を返す。
 * `removePerson`(実行)と`computeRemovalImpact`(予告)の双方がこの戻り値を使うことで、
 * 「削除されると予告した家族が残る」種の食い違いが表現できないようにする(design.md D1)。
 */
function planFamilyRemoval(
  doc: TreeDocument,
  personId: PersonId,
): { families: TreeDocument['families']; removedFamilies: Family[] } {
  const families: TreeDocument['families'] = {}
  const removedFamilies: Family[] = []
  for (const family of Object.values(doc.families)) {
    const spouseIds = family.spouseIds.filter((id) => id !== personId)
    const children = family.children.filter((c) => c.childId !== personId)
    const next = { ...family, spouseIds, children }
    const changed =
      spouseIds.length !== family.spouseIds.length || children.length !== family.children.length
    // 無関係な家族を人物削除の巻き添えで消さないため、空判定はこの削除で内容が変化した
    // 家族にのみ適用する。変化していない家族は従来どおり完全に空の場合だけ落とす
    const drop = changed
      ? isVacantFamily(next)
      : next.spouseIds.length === 0 && next.children.length === 0
    if (drop) {
      removedFamilies.push(family)
      continue
    }
    families[family.id] = next
  }
  return { families, removedFamilies }
}

export interface RemovalImpact {
  /** 配偶者として属している家族の数 */
  spouseFamilyCount: number
  /** 子として帰属しているリンクの数 */
  childLinkCount: number
  /** この人物の削除に伴い削除される家族の数 */
  removedFamilyCount: number
  /** 削除される家族が持つ婚姻・離婚イベントの合計件数(削除で失われる記録の件数) */
  removedFamilyEventCount: number
}

/** 削除確認ダイアログ用: 人物削除の影響範囲を返す */
export function computeRemovalImpact(doc: TreeDocument, personId: PersonId): RemovalImpact {
  const families = Object.values(doc.families)
  const spouseFamilies = families.filter((f) => f.spouseIds.includes(personId))
  const childLinks = families.filter((f) => f.children.some((c) => c.childId === personId))
  const { removedFamilies } = planFamilyRemoval(doc, personId)
  return {
    spouseFamilyCount: spouseFamilies.length,
    childLinkCount: childLinks.length,
    removedFamilyCount: removedFamilies.length,
    removedFamilyEventCount: removedFamilies.reduce((sum, f) => sum + f.events.length, 0),
  }
}

/**
 * 人物を削除し、関係の整合を保つ。
 * - 配偶者として属す家族から除く。その結果、家族として意味を成さなくなった家族
 *   (配偶者0人、または配偶者1人で子もいない)は削除する。配偶者0人の家族は子の有無に
 *   関わらず削除され、残る子は親リンクを失うだけで人物としては残る
 * - 子として帰属するリンクを除く
 */
export function removePerson(doc: TreeDocument, personId: PersonId): TreeDocument {
  if (!doc.persons[personId]) throw new Error(`人物が見つかりません: ${personId}`)
  const persons = { ...doc.persons }
  delete persons[personId]

  const { families } = planFamilyRemoval(doc, personId)
  return touch({ ...doc, persons, families })
}

export function removeFamily(doc: TreeDocument, familyId: FamilyId): TreeDocument {
  if (!doc.families[familyId]) throw new Error(`家族が見つかりません: ${familyId}`)
  const families = { ...doc.families }
  delete families[familyId]
  return touch({ ...doc, families })
}

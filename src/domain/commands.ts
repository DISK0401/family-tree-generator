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

/**
 * 指定人物の祖先の集合を返す。
 *
 * `findPrimaryParentFamily`(描画用の主たる親)と異なり、その人物が子として属する
 * **全ての**家族をたどる。実親・養親の双方が記録されている人物では、主たる親家族だけを
 * 見ると養親側の系統を見落とし、養親経由の循環を検出できないため
 * (spec family-data-model「世代方向の循環の禁止」)。
 * 各人物は`ancestors`へ高々1回しか積まれないため、既存データが循環を含む場合でも停止する。
 */
export function collectAncestors(doc: TreeDocument, personId: PersonId): Set<PersonId> {
  const ancestors = new Set<PersonId>()
  const queue: PersonId[] = [personId]
  while (queue.length > 0) {
    const current = queue.shift()
    if (current === undefined) break
    for (const family of Object.values(doc.families)) {
      if (!family.children.some((c) => c.childId === current)) continue
      for (const parentId of family.spouseIds) {
        if (ancestors.has(parentId)) continue
        ancestors.add(parentId)
        queue.push(parentId)
      }
    }
  }
  return ancestors
}

/**
 * 親子リンク(parentId → childId)を作ると世代方向の循環が生じるか(design.md D7)。
 * childIdがparentIdの祖先である場合、このリンクはchildIdを自分自身の祖先にしてしまう。
 * いとこ婚のように無向グラフとしては閉路になるが世代方向に矛盾しない関係はtrueにならない。
 */
export function wouldCreateAncestryCycle(
  doc: TreeDocument,
  parentId: PersonId,
  childId: PersonId,
): boolean {
  if (parentId === childId) return true
  return collectAncestors(doc, parentId).has(childId)
}

function requirePerson(doc: TreeDocument, personId: PersonId): void {
  if (!doc.persons[personId]) throw new Error(`人物が見つかりません: ${personId}`)
}

/**
 * 既存人物を子として繋ぐときの既定の続柄。
 *
 * 既に親家族を持つ人物へさらに親家族を足す場合、その2つ目を「実子」とすると
 * 実の親が2組いることになり矛盾する。実際には養子・継子・里子のいずれかだが、
 * どれかは推測できないため「不明」で記録し、続柄の編集で利用者に確定してもらう。
 * 「不明」は実子以外として扱われるため、図では破線の系線になり、
 * `findPrimaryParentFamily`が主たる親家族として採用する側にもなる
 * (=生まれた家ではなく、後から入った家の側が既定の視点になる。design.md D2)。
 * 親家族をまだ持たない人物は、そのまま実子として記録する
 */
function defaultLinkPedigree(doc: TreeDocument, childId: PersonId): Pedigree {
  const hasParentFamily = Object.values(doc.families).some((f) =>
    f.children.some((c) => c.childId === childId),
  )
  return hasParentFamily ? 'unknown' : 'biological'
}

/**
 * 既存の2人の人物を配偶者とする**新しい**家族を作る(spec family-data-model
 * 「既存人物同士の関係リンク」)。人物は新規作成しない点だけが`addSpouse`と異なる。
 * 既存の家族へ合流させる経路は`addSpouseLink`であり、こちらとは用途が異なるため統合しない
 * (design.md D2)。同一カップルの復縁は1つの家族のイベントとして表現するため、
 * 既に配偶者である相手は拒否する。
 */
export function linkSpouse(
  doc: TreeDocument,
  personId: PersonId,
  spouseId: PersonId,
  kind: FamilyKind = 'unknown',
): { doc: TreeDocument; familyId: FamilyId } {
  requirePerson(doc, personId)
  requirePerson(doc, spouseId)
  if (personId === spouseId) throw new Error(`自分自身を配偶者にはできません: ${personId}`)
  if (
    Object.values(doc.families).some(
      (f) => f.spouseIds.includes(personId) && f.spouseIds.includes(spouseId),
    )
  ) {
    throw new Error(`既に配偶者です: ${personId} / ${spouseId}`)
  }
  const family = createFamily({ spouseIds: [personId, spouseId], kind })
  return { doc: touch(putFamily(doc, family)), familyId: family.id }
}

/**
 * 既存人物を子として帰属させる(spec family-data-model「既存人物同士の関係リンク」)。
 * 対象の家族の決め方は`addChild`と同一(相方指定があればその家族、なければ配偶者1件の家族、
 * 該当なしなら新設)で、人物を新規作成しない点だけが異なる。
 * 既に他の家族へ子として属している人物も帰属させられる(養子縁組を後から記録する経路)。
 */
export function linkChild(
  doc: TreeDocument,
  parentId: PersonId,
  childId: PersonId,
  options?: { otherParentId?: PersonId; pedigree?: Pedigree },
): { doc: TreeDocument; familyId: FamilyId } {
  requirePerson(doc, parentId)
  requirePerson(doc, childId)
  const otherParentId = options?.otherParentId
  if (otherParentId !== undefined) requirePerson(doc, otherParentId)
  if (wouldCreateAncestryCycle(doc, parentId, childId)) {
    throw new Error(`世代方向の循環になるため子にできません: ${childId}`)
  }
  if (otherParentId !== undefined && wouldCreateAncestryCycle(doc, otherParentId, childId)) {
    throw new Error(`世代方向の循環になるため子にできません: ${childId}`)
  }

  const pedigree = options?.pedigree ?? defaultLinkPedigree(doc, childId)
  const family = Object.values(doc.families).find((f) =>
    otherParentId
      ? f.spouseIds.includes(parentId) && f.spouseIds.includes(otherParentId)
      : f.spouseIds.length === 1 && f.spouseIds[0] === parentId,
  )

  if (!family) {
    const created = createFamily({
      spouseIds: otherParentId ? [parentId, otherParentId] : [parentId],
      children: [{ childId, pedigree }],
    })
    return { doc: touch(putFamily(doc, created)), familyId: created.id }
  }
  if (family.spouseIds.includes(childId)) {
    throw new Error(`家族の配偶者を子にはできません: ${childId}`)
  }
  if (family.children.some((c) => c.childId === childId)) {
    return { doc, familyId: family.id }
  }
  return {
    doc: touch(
      putFamily(doc, { ...family, children: [...family.children, { childId, pedigree }] }),
    ),
    familyId: family.id,
  }
}

/**
 * 既存人物を親として帰属させる(spec family-data-model「既存人物同士の関係リンク」)。
 * 人物を新規作成しない点と、親側が既に持つ家族へ加われる点が`addParent`と異なる。
 *
 * 帰属先の決め方は次の順で、いずれも「既にある家族を壊さない」ことを優先する。
 * 1. 子が配偶者1件のみの親家族に属していれば、その家族の2人目の配偶者として加わる
 *    (`addParent`と同じ。ひとり親として記録済みの家族へもう一方の親を補う経路)
 * 2. 親が配偶者として属する家族がちょうど1件なら、その家族の子として加える。
 *    親に既に配偶者がいるのに配偶者不在の家族を新設すると、同じ夫婦の家族が二重になり
 *    「配偶者未登録」の枠が生まれてしまうため(婿養子のように、既存の夫婦へ後から
 *    養子を加える経路がこれにあたる)
 * 3. どちらにも当てはまらなければ、その親だけの家族を新設する
 *
 * 2 は親の配偶者を子のもう一方の親として扱うことになるため、親が複数の家族を持つ場合
 * (再婚等でどの家族の子か決められない場合)は行わず、3 の新設にとどめる。
 * 続柄は`defaultLinkPedigree`に従い、既に親家族を持つ人物なら「不明」で記録する
 */
export function linkParent(
  doc: TreeDocument,
  childId: PersonId,
  parentId: PersonId,
): { doc: TreeDocument; familyId: FamilyId } {
  requirePerson(doc, childId)
  requirePerson(doc, parentId)
  if (wouldCreateAncestryCycle(doc, parentId, childId)) {
    throw new Error(`世代方向の循環になるため親にできません: ${parentId}`)
  }

  const existing = Object.values(doc.families).find(
    (f) => f.children.some((c) => c.childId === childId) && f.spouseIds.length === 1,
  )
  if (existing) {
    if (existing.spouseIds.includes(parentId)) return { doc, familyId: existing.id }
    return {
      doc: touch(putFamily(doc, { ...existing, spouseIds: [...existing.spouseIds, parentId] })),
      familyId: existing.id,
    }
  }

  const pedigree = defaultLinkPedigree(doc, childId)
  const parentFamilies = Object.values(doc.families).filter((f) => f.spouseIds.includes(parentId))
  if (parentFamilies.length === 1) {
    const family = parentFamilies[0]
    if (family.children.some((c) => c.childId === childId)) return { doc, familyId: family.id }
    return {
      doc: touch(
        putFamily(doc, { ...family, children: [...family.children, { childId, pedigree }] }),
      ),
      familyId: family.id,
    }
  }

  const family = createFamily({ spouseIds: [parentId], children: [{ childId, pedigree }] })
  return { doc: touch(putFamily(doc, family)), familyId: family.id }
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
 * 変更後の家族をドキュメントへ反映する。変更の結果、家族として意味を成さなくなった場合は
 * その家族を削除する。人物削除と同じ`isVacantFamily`を通すことで、関係リンクの解除でも
 * 不変条件が同一の判定で満たされるようにする(design.md D4)。
 */
function applyFamilyChange(doc: TreeDocument, next: Family): TreeDocument {
  if (!isVacantFamily(next)) return putFamily(doc, next)
  const families = { ...doc.families }
  delete families[next.id]
  return { ...doc, families }
}

/**
 * 人物を削除せずに子リンクだけを外す(spec family-data-model「関係リンクの解除」)。
 * 外した結果、配偶者1件・子0件となった家族は`applyFamilyChange`により削除される。
 * 配偶者のいない人物へ誤って子を追加した場合、その家族は誤りを入れるためだけに
 * 生まれた器のため、消えるのが正しい。
 */
export function unlinkChild(
  doc: TreeDocument,
  familyId: FamilyId,
  childId: PersonId,
): TreeDocument {
  const family = doc.families[familyId]
  if (!family) throw new Error(`家族が見つかりません: ${familyId}`)
  if (!family.children.some((c) => c.childId === childId)) return doc
  const next = { ...family, children: family.children.filter((c) => c.childId !== childId) }
  return touch(applyFamilyChange(doc, next))
}

/**
 * 人物を削除せずに、その人物を家族の配偶者から外す(spec family-data-model「関係リンクの解除」)。
 * `removePerson`の家族処理を1つの家族に限定した版にあたるため、後始末の判定を共有する。
 * 子が帰属している家族ではひとり親の家族として存続し、子の帰属と婚姻・離婚イベントは維持される。
 */
export function unlinkSpouse(
  doc: TreeDocument,
  familyId: FamilyId,
  personId: PersonId,
): TreeDocument {
  const family = doc.families[familyId]
  if (!family) throw new Error(`家族が見つかりません: ${familyId}`)
  if (!family.spouseIds.includes(personId)) return doc
  const next = { ...family, spouseIds: family.spouseIds.filter((id) => id !== personId) }
  return touch(applyFamilyChange(doc, next))
}

/** どの家族にも配偶者としても子としても現れないか(spec family-data-model「どのFamilyにも属さない人物の保持」) */
export function isUnconnectedPerson(doc: TreeDocument, personId: PersonId): boolean {
  return !Object.values(doc.families).some(
    (f) => f.spouseIds.includes(personId) || f.children.some((c) => c.childId === personId),
  )
}

/** 解除の対象。子リンクを外すか、配偶者参照を外すか */
export type UnlinkTarget = { kind: 'child' | 'spouse'; personId: PersonId }

export interface UnlinkImpact {
  /** 解除に伴い家族(Family)そのものが削除されるか */
  familyRemoved: boolean
  /** 家族ごと削除される場合に失われる婚姻・離婚イベントの件数 */
  removedFamilyEventCount: number
  /** 家族ごと削除される場合に親リンクを失う、対象以外の子の件数 */
  orphanedChildCount: number
  /** 解除後、対象の人物がどの家族にも属さなくなるか(図から外れ、一覧へ移る) */
  becomesUnconnected: boolean
}

/**
 * 解除確認ダイアログ用: 関係リンク解除の影響範囲を返す(spec tree-editor「関係リンクの解除」)。
 * 予告と実行の食い違いを構造的に排除するため、判定を模倣せず`unlinkChild`/`unlinkSpouse`
 * そのものを実行した結果を観測する(design.md D4。`computeRemovalImpact`が
 * `planFamilyRemoval`を共有するのと同じ考え方を、さらに徹底したもの)。
 */
export function computeUnlinkImpact(
  doc: TreeDocument,
  familyId: FamilyId,
  target: UnlinkTarget,
): UnlinkImpact {
  const family = doc.families[familyId]
  if (!family) throw new Error(`家族が見つかりません: ${familyId}`)
  const next =
    target.kind === 'child'
      ? unlinkChild(doc, familyId, target.personId)
      : unlinkSpouse(doc, familyId, target.personId)
  const familyRemoved = next.families[familyId] === undefined
  return {
    familyRemoved,
    removedFamilyEventCount: familyRemoved ? family.events.length : 0,
    orphanedChildCount: familyRemoved
      ? family.children.filter((c) => c.childId !== target.personId).length
      : 0,
    becomesUnconnected: isUnconnectedPerson(next, target.personId),
  }
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

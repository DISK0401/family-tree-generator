import { useId, useState, type FormEvent, type RefObject } from 'react'
import {
  addChild,
  addParent,
  addSpouse,
  linkChild,
  linkParent,
  linkSpouse,
  updatePerson,
  wouldCreateAncestryCycle,
} from '../domain/commands'
import { displayName } from '../domain/helpers'
import type { Person, PersonId, TreeDocument } from '../domain/types'
import { useTreeStore } from '../store/tree-store'
import { DeletePersonControl } from './DeletePersonControl'
import { FamilyEventEditor } from './FamilyEventEditor'
import { PedigreeEditor } from './PedigreeEditor'
import { PersonEditForm } from './PersonEditForm'
import { PersonNameFields } from './PersonNameFields'
import { PersonPicker } from './PersonPicker'
import { nameFromFields } from './person-name'
import './PersonPanel.css'

type RelationAction = 'spouse' | 'child' | 'parent'

const ACTION_LABEL: Record<RelationAction, string> = {
  spouse: '配偶者を追加',
  child: '子を追加',
  parent: '親を追加',
}

/** 選択中人物が唯一の配偶者を持つ場合、その配偶者IDを返す(子追加時の相方推定に使う) */
function findSoleSpouseId(doc: TreeDocument, personId: PersonId): PersonId | undefined {
  const spouseIds = new Set<PersonId>()
  for (const family of Object.values(doc.families)) {
    if (!family.spouseIds.includes(personId)) continue
    for (const id of family.spouseIds) {
      if (id !== personId) spouseIds.add(id)
    }
  }
  return spouseIds.size === 1 ? [...spouseIds][0] : undefined
}

/** 関係先の候補を選ぶ`<select>`の見出し。新規作成との違いが読み取れる文言にする */
const EXISTING_LABEL: Record<RelationAction, string> = {
  spouse: '既存の人物と新しい婚姻を作る',
  child: '既存の人物を子として紐づける',
  parent: '既存の人物を親として紐づける',
}

/**
 * 関係先に選べる既存人物(spec tree-editor「既存の人物を関係先に選ぶ」)。
 * その関係が成立しえない人物 — 選択中の人物自身、既にその関係が成立している人物、
 * 成立させると世代方向の循環になる人物 — を候補から除く。
 */
function relationCandidates(
  doc: TreeDocument,
  personId: PersonId,
  action: RelationAction,
): Person[] {
  const others = Object.values(doc.persons).filter((p) => p.id !== personId)

  if (action === 'spouse') {
    // 同一カップルの復縁は1つの家族のイベントとして表現するため、既に配偶者の相手は外す
    const spouseIds = new Set<PersonId>()
    for (const family of Object.values(doc.families)) {
      if (!family.spouseIds.includes(personId)) continue
      for (const id of family.spouseIds) {
        if (id !== personId) spouseIds.add(id)
      }
    }
    return others.filter((p) => !spouseIds.has(p.id))
  }

  if (action === 'parent') {
    // `linkParent`と同じ規則で合流先になる家族。そこに既にいる親は候補から外す
    const parentFamily = Object.values(doc.families).find(
      (f) => f.children.some((c) => c.childId === personId) && f.spouseIds.length === 1,
    )
    return others.filter(
      (p) =>
        !wouldCreateAncestryCycle(doc, p.id, personId) &&
        !parentFamily?.spouseIds.includes(p.id),
    )
  }

  // 子: `linkChild`と同じ規則で帰属先になる家族の配偶者・既存の子と、自分の祖先を外す
  const otherParentId = findSoleSpouseId(doc, personId)
  const family = Object.values(doc.families).find((f) =>
    otherParentId
      ? f.spouseIds.includes(personId) && f.spouseIds.includes(otherParentId)
      : f.spouseIds.length === 1 && f.spouseIds[0] === personId,
  )
  return others.filter((p) => {
    if (wouldCreateAncestryCycle(doc, personId, p.id)) return false
    if (otherParentId !== undefined && wouldCreateAncestryCycle(doc, otherParentId, p.id)) {
      return false
    }
    if (!family) return true
    return !family.spouseIds.includes(p.id) && !family.children.some((c) => c.childId === p.id)
  })
}

interface PersonPanelProps {
  personId: PersonId
  onDeleted: () => void
  onClose: () => void
  /** 未確定の変更(ダーティ状態)を親へ通知する(design.md D3) */
  onDirtyChange?: (isDirty: boolean) => void
  /** 親から`requestSubmit()`で確定操作をプログラム的に実行できるようにする(design.md D3) */
  editFormRef?: RefObject<HTMLFormElement | null>
  /** 配偶者・子・親の追加で人物を新規作成した直後に呼ばれる(design.md D3)。
   * 親はこれを選択状態の切り替えに使い、新規人物へフォーカスを移す */
  onPersonCreated?: (personId: PersonId) => void
}

/**
 * 選択中人物のコンテキストアクション(配偶者・子・親の追加)。
 * 「図の上で家族を育てる」操作モデル(design.md D7)。フォームはこのパネル内で
 * 完結させ、モーダルで作業を中断させない。
 */
export function PersonPanel({ personId, onDeleted, onClose, onDirtyChange, editFormRef, onPersonCreated }: PersonPanelProps) {
  const apply = useTreeStore((s) => s.apply)
  const document = useTreeStore((s) => s.document)
  const person = useTreeStore((s) => s.document.persons[personId])
  const [openAction, setOpenAction] = useState<RelationAction | null>(null)
  // 新しい人物を作るか、既存の人物から選ぶか(spec tree-editor「既存の人物を関係先に選ぶ」)
  const [useExisting, setUseExisting] = useState(false)
  const [surname, setSurname] = useState('')
  const [given, setGiven] = useState('')
  const existingSelectId = useId()

  if (!person) return null

  const canSubmit = surname.trim().length > 0 || given.trim().length > 0
  const candidates = openAction ? relationCandidates(document, personId, openAction) : []

  function openForm(action: RelationAction) {
    setOpenAction(action)
    setUseExisting(false)
    setSurname('')
    setGiven('')
  }

  function closeForm() {
    setOpenAction(null)
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit || !openAction) return
    const name = nameFromFields(surname, given)

    let createdId: PersonId | undefined

    if (openAction === 'spouse') {
      apply((doc) => {
        const result = addSpouse(doc, personId, { name })
        createdId = result.spouseId
        return result.doc
      })
    } else if (openAction === 'child') {
      apply((doc) => {
        const otherParentId = findSoleSpouseId(doc, personId)
        const result = addChild(doc, personId, { name }, otherParentId ? { otherParentId } : undefined)
        createdId = result.childId
        return result.doc
      })
    } else if (openAction === 'parent') {
      apply((doc) => {
        const result = addParent(doc, personId, { name })
        createdId = result.parentId
        return result.doc
      })
    }
    closeForm()
    if (createdId !== undefined) onPersonCreated?.(createdId)
  }

  /**
   * 既存の人物を関係先に選ぶ。`PedigreeEditor`等と同じく、選択と同時に即座に反映し
   * 確定操作を設けない(spec tree-editor)。人物は新規作成されないため、
   * 対象の氏名・生没日・メモはそのまま保持される
   */
  function handleSelectExisting(otherId: PersonId) {
    if (!otherId || !openAction) return
    if (openAction === 'spouse') {
      apply((doc) => linkSpouse(doc, personId, otherId).doc)
    } else if (openAction === 'child') {
      apply((doc) => {
        const otherParentId = findSoleSpouseId(doc, personId)
        return linkChild(doc, personId, otherId, otherParentId ? { otherParentId } : undefined).doc
      })
    } else {
      apply((doc) => linkParent(doc, personId, otherId).doc)
    }
    closeForm()
  }

  function handleSave(patch: Partial<Omit<Person, 'id'>>) {
    apply((doc) => updatePerson(doc, personId, patch))
  }

  return (
    <div className="person-panel">
      <div className="person-panel-header">
        <h2 className="person-panel-name">{displayName(person)}</h2>
        {/* 狭幅画面ではパネルが全画面表示になり図に戻る手段がなくなるため、
            常時表示の閉じるボタンで図へ戻れるようにする */}
        <button type="button" className="person-panel-close" onClick={onClose} aria-label="パネルを閉じる">
          ✕
        </button>
      </div>

      {/* コアループ(図の上で家族を育てる)の導線を最上部に置く。
          フォームの下に埋もれると初見ユーザーが次の操作を見失うため(design.md D7) */}
      <div className="person-panel-actions">
        {(Object.keys(ACTION_LABEL) as RelationAction[]).map((action) => (
          <button
            key={action}
            type="button"
            className="person-panel-action-button"
            aria-pressed={openAction === action}
            onClick={() => (openAction === action ? closeForm() : openForm(action))}
          >
            {ACTION_LABEL[action]}
          </button>
        ))}
      </div>

      {openAction && (
        <div className="person-panel-relation-form">
          <div className="person-panel-relation-modes" role="group" aria-label="追加の方法">
            <button
              type="button"
              aria-pressed={!useExisting}
              onClick={() => setUseExisting(false)}
            >
              新しく作る
            </button>
            <button
              type="button"
              aria-pressed={useExisting}
              onClick={() => setUseExisting(true)}
            >
              既存の人物から選ぶ
            </button>
          </div>

          {useExisting ? (
            <div className="person-panel-relation-existing">
              {candidates.length > 0 ? (
                <label htmlFor={existingSelectId}>
                  {EXISTING_LABEL[openAction]}
                  <PersonPicker
                    id={existingSelectId}
                    candidates={candidates}
                    onSelect={handleSelectExisting}
                  />
                </label>
              ) : (
                <p className="person-panel-relation-note">
                  この関係に選べる既存の人物はいません。
                </p>
              )}
              <div className="person-panel-relation-actions">
                <button type="button" onClick={closeForm}>
                  キャンセル
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="person-panel-relation-new">
              <PersonNameFields
                surname={surname}
                given={given}
                onSurnameChange={setSurname}
                onGivenChange={setGiven}
                autoFocus
              />
              <div className="person-panel-relation-actions">
                <button type="button" onClick={closeForm}>
                  キャンセル
                </button>
                <button type="submit" disabled={!canSubmit}>
                  追加する
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      <PersonEditForm
        key={personId}
        person={person}
        onSave={handleSave}
        onDirtyChange={onDirtyChange}
        formRef={editFormRef}
      />

      <PedigreeEditor personId={personId} />

      <FamilyEventEditor personId={personId} />

      <DeletePersonControl personId={personId} onDeleted={onDeleted} />
    </div>
  )
}

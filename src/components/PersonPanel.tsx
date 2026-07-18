import { useState, type FormEvent } from 'react'
import { addChild, addParent, addSpouse, updatePerson } from '../domain/commands'
import { displayName } from '../domain/helpers'
import type { Person, PersonId, TreeDocument } from '../domain/types'
import { useTreeStore } from '../store/tree-store'
import { DeletePersonControl } from './DeletePersonControl'
import { PedigreeEditor } from './PedigreeEditor'
import { PersonEditForm } from './PersonEditForm'
import { PersonNameFields } from './PersonNameFields'
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

interface PersonPanelProps {
  personId: PersonId
  onDeleted: () => void
  onClose: () => void
}

/**
 * 選択中人物のコンテキストアクション(配偶者・子・親の追加)。
 * 「図の上で家族を育てる」操作モデル(design.md D7)。フォームはこのパネル内で
 * 完結させ、モーダルで作業を中断させない。
 */
export function PersonPanel({ personId, onDeleted, onClose }: PersonPanelProps) {
  const apply = useTreeStore((s) => s.apply)
  const person = useTreeStore((s) => s.document.persons[personId])
  const [openAction, setOpenAction] = useState<RelationAction | null>(null)
  const [surname, setSurname] = useState('')
  const [given, setGiven] = useState('')

  if (!person) return null

  const canSubmit = surname.trim().length > 0 || given.trim().length > 0

  function openForm(action: RelationAction) {
    setOpenAction(action)
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

    if (openAction === 'spouse') {
      apply((doc) => addSpouse(doc, personId, { name }).doc)
    } else if (openAction === 'child') {
      apply((doc) => {
        const otherParentId = findSoleSpouseId(doc, personId)
        return addChild(doc, personId, { name }, otherParentId ? { otherParentId } : undefined).doc
      })
    } else if (openAction === 'parent') {
      apply((doc) => addParent(doc, personId, { name }).doc)
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
        <form onSubmit={handleSubmit} className="person-panel-relation-form">
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

      <PersonEditForm key={personId} person={person} onSave={handleSave} />

      <PedigreeEditor personId={personId} />

      <DeletePersonControl personId={personId} onDeleted={onDeleted} />
    </div>
  )
}

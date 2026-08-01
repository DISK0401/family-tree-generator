import { useState, type FormEvent } from 'react'
import { addPerson } from '../domain/commands'
import type { PersonId } from '../domain/types'
import { useTreeStore } from '../store/tree-store'
import { EmptyStateGhostPreview } from './EmptyStateGhostPreview'
import { PersonNameFields } from './PersonNameFields'
import { nameFromFields } from './person-name'
import './EmptyStateGuide.css'

interface EmptyStateGuideProps {
  /** 追加した人物を選択状態にするための通知(AddPersonControlのonAddedと同じ挙動。監査 低11) */
  onAdded?: (personId: PersonId) => void
}

/**
 * 人物ゼロの空状態から最初の人物を追加する導線。
 * 空状態では「最初の人物を追加する」ことにのみ焦点を絞る(spec tree-editor)。
 * 追加直後はその人物を選択状態にし、続けて生没日・性別・メモを入力できるようにする。
 */
export function EmptyStateGuide({ onAdded }: EmptyStateGuideProps) {
  const apply = useTreeStore((s) => s.apply)
  const [surname, setSurname] = useState('')
  const [given, setGiven] = useState('')

  const canSubmit = given.trim().length > 0 || surname.trim().length > 0

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    let addedId = ''
    apply((doc) => {
      const result = addPerson(doc, { name: nameFromFields(surname, given) })
      addedId = result.personId
      return result.doc
    })
    if (addedId) onAdded?.(addedId)
  }

  return (
    <div className="empty-state-guide">
      <EmptyStateGhostPreview />
      <div className="empty-state-guide-body">
        <h2>家系図をはじめる</h2>
        <p>
          まずは最初の人物を追加しましょう。
          <br />
          たとえば、あなた自身から。
        </p>
        <form onSubmit={handleSubmit} className="empty-state-guide-form">
          <PersonNameFields
            surname={surname}
            given={given}
            onSurnameChange={setSurname}
            onGivenChange={setGiven}
            autoFocus
          />
          <button
            type="submit"
            className="btn btn--primary"
            disabled={!canSubmit}
          >
            最初の人物を追加
          </button>
        </form>
      </div>
    </div>
  )
}

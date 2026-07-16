import { useState, type FormEvent } from 'react'
import { addPerson } from '../domain/commands'
import { useTreeStore } from '../store/tree-store'
import { PersonNameFields } from './PersonNameFields'
import { nameFromFields } from './person-name'
import './EmptyStateGuide.css'

/**
 * 人物ゼロの空状態から最初の人物を追加する導線。
 * 空状態では「最初の人物を追加する」ことにのみ焦点を絞る(spec tree-editor)。
 */
export function EmptyStateGuide() {
  const apply = useTreeStore((s) => s.apply)
  const [surname, setSurname] = useState('')
  const [given, setGiven] = useState('')

  const canSubmit = given.trim().length > 0 || surname.trim().length > 0

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    apply((doc) => addPerson(doc, { name: nameFromFields(surname, given) }).doc)
  }

  return (
    <div className="empty-state-guide">
      <div className="empty-state-guide-body">
        <h2>家系図をはじめる</h2>
        <p>まずは最初の人物(たとえばあなた自身)を追加してください。</p>
        <form onSubmit={handleSubmit} className="empty-state-guide-form">
          <PersonNameFields
            surname={surname}
            given={given}
            onSurnameChange={setSurname}
            onGivenChange={setGiven}
            autoFocus
          />
          <button type="submit" disabled={!canSubmit}>
            最初の人物を追加
          </button>
        </form>
      </div>
    </div>
  )
}

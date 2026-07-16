import { useId, useState, type FormEvent } from 'react'
import { addPerson } from '../domain/commands'
import { useTreeStore } from '../store/tree-store'
import './EmptyStateGuide.css'

/**
 * 人物ゼロの空状態から最初の人物を追加する導線。
 * 空状態では「最初の人物を追加する」ことにのみ焦点を絞る(spec tree-editor)。
 */
export function EmptyStateGuide() {
  const apply = useTreeStore((s) => s.apply)
  const [surname, setSurname] = useState('')
  const [given, setGiven] = useState('')
  const surnameId = useId()
  const givenId = useId()

  const canSubmit = given.trim().length > 0 || surname.trim().length > 0

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    apply(
      (doc) =>
        addPerson(doc, {
          name: {
            ...(surname.trim() && { surname: surname.trim() }),
            ...(given.trim() && { given: given.trim() }),
          },
        }).doc,
    )
  }

  return (
    <div className="empty-state-guide">
      <div className="empty-state-guide-body">
        <h2>家系図をはじめる</h2>
        <p>まずは最初の人物(たとえばあなた自身)を追加してください。</p>
        <form onSubmit={handleSubmit} className="empty-state-guide-form">
          <div className="empty-state-guide-fields">
            <label htmlFor={surnameId}>
              姓
              <input
                id={surnameId}
                type="text"
                value={surname}
                onChange={(e) => setSurname(e.target.value)}
                placeholder="山田"
                autoFocus
              />
            </label>
            <label htmlFor={givenId}>
              名
              <input
                id={givenId}
                type="text"
                value={given}
                onChange={(e) => setGiven(e.target.value)}
                placeholder="太郎"
              />
            </label>
          </div>
          <button type="submit" disabled={!canSubmit}>
            最初の人物を追加
          </button>
        </form>
      </div>
    </div>
  )
}

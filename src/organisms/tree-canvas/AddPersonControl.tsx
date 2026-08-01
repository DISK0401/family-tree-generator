import { useState, type FormEvent } from 'react'
import { addPerson } from '../../domain/commands'
import type { PersonId } from '../../domain/types'
import { useTreeStore } from '../../store/tree-store'
import { PersonNameFields } from '../../molecules/PersonNameFields'
import { nameFromFields } from '../../molecules/person-name'
import './AddPersonControl.css'
import { Button } from '../../atoms/Button'

interface AddPersonControlProps {
  /** 追加した人物を選択状態にするための通知(spec tree-editor「関係を指定しない人物の追加」) */
  onAdded: (personId: PersonId) => void
}

/**
 * 関係を指定しない人物の追加(spec tree-editor)。
 *
 * 既存の関係追加(`PersonPanel`のコンテキストアクション)は選択中の人物を起点とするため、
 * 「誰の何として登録するか」を先に決められない場面では使えない。戸籍等を書き写す際に
 * 系統を決めないまま氏名を打ち込めるよう、選択なしで押せるキャンバス上の導線として置く。
 * 追加した人物はどの家族にも属さないため図には現れず、`UnconnectedTray`に並ぶ。
 * 追加直後に選択状態にすることで、続けて生没日・性別・メモを入力できるようにする。
 */
export function AddPersonControl({ onAdded }: AddPersonControlProps) {
  const apply = useTreeStore((s) => s.apply)
  const [open, setOpen] = useState(false)
  const [surname, setSurname] = useState('')
  const [given, setGiven] = useState('')

  const canSubmit = surname.trim().length > 0 || given.trim().length > 0

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    let addedId = ''
    apply((doc) => {
      const result = addPerson(doc, { name: nameFromFields(surname, given) })
      addedId = result.personId
      return result.doc
    })
    setSurname('')
    setGiven('')
    setOpen(false)
    if (addedId) onAdded(addedId)
  }

  return (
    <div className="add-person-control">
      <Button
        tight
        className="surface--overlay add-person-trigger"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        人物を追加
      </Button>
      {open && (
        <form
          onSubmit={handleSubmit}
          className="add-person-form surface--raised"
        >
          <p className="add-person-hint">
            関係を決めずに登録します。追加後に配偶者・子・親として繋げられます。
          </p>
          <PersonNameFields
            surname={surname}
            given={given}
            onSurnameChange={setSurname}
            onGivenChange={setGiven}
            autoFocus
          />
          <div className="add-person-actions">
            <Button variant="outline" onClick={() => setOpen(false)}>
              キャンセル
            </Button>
            <Button variant="primary-soft" type="submit" disabled={!canSubmit}>
              追加する
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

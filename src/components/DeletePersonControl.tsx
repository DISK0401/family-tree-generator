import { useId, useState } from 'react'
import { computeRemovalImpact, removePerson } from '../domain/commands'
import { displayName } from '../domain/helpers'
import type { PersonId } from '../domain/types'
import { useTreeStore } from '../store/tree-store'
import './confirm-dialog.css'
import './DeletePersonControl.css'

interface DeletePersonControlProps {
  personId: PersonId
  onDeleted: () => void
}

/**
 * 人物の削除。削除前に影響範囲(配偶者関係・子の帰属の件数)を提示して確認を求める
 * (spec tree-editor「人物・関係の削除」)。undoで復元できる旨も明示する。
 */
export function DeletePersonControl({ personId, onDeleted }: DeletePersonControlProps) {
  const document = useTreeStore((s) => s.document)
  const apply = useTreeStore((s) => s.apply)
  const [open, setOpen] = useState(false)
  const titleId = useId()

  const person = document.persons[personId]
  if (!person) return null

  const impact = computeRemovalImpact(document, personId)

  function handleConfirm() {
    apply((doc) => removePerson(doc, personId))
    setOpen(false)
    onDeleted()
  }

  return (
    <>
      <button type="button" className="delete-person-trigger" onClick={() => setOpen(true)}>
        この人物を削除
      </button>
      {open && (
        <div className="confirm-dialog-overlay">
          <div
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <h2 id={titleId}>{displayName(person)}を削除しますか?</h2>
            <p>
              配偶者関係 {impact.spouseFamilyCount} 件・子の帰属 {impact.childLinkCount}{' '}
              件も変更されます。直後であればundoで復元できます。
            </p>
            <div className="confirm-dialog-actions">
              <button type="button" onClick={() => setOpen(false)}>
                キャンセル
              </button>
              <button type="button" className="confirm-dialog-danger-button" onClick={handleConfirm}>
                削除する
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

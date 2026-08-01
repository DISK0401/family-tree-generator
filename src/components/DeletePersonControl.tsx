import { useState } from 'react'
import { computeRemovalImpact, removePerson } from '../domain/commands'
import { displayName } from '../domain/helpers'
import type { PersonId } from '../domain/types'
import { useTreeStore } from '../store/tree-store'
import { ConfirmDialog } from './ConfirmDialog'
import './DeletePersonControl.css'

interface DeletePersonControlProps {
  personId: PersonId
  onDeleted: () => void
}

/**
 * 人物の削除。削除前に影響範囲(配偶者関係・子の帰属の件数)を提示して確認を求める
 * (spec tree-editor「人物・関係の削除」)。undoで復元できる旨も明示する。
 */
export function DeletePersonControl({
  personId,
  onDeleted,
}: DeletePersonControlProps) {
  const document = useTreeStore((s) => s.document)
  const apply = useTreeStore((s) => s.apply)
  const [open, setOpen] = useState(false)

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
      <button
        type="button"
        className="btn btn--danger-outline btn--tight delete-person-trigger"
        onClick={() => setOpen(true)}
      >
        この人物を削除
      </button>
      {open && (
        <ConfirmDialog
          title={`${displayName(person)}さんを削除しますか？`}
          alertdialog
          confirmLabel="削除する"
          confirmDanger
          onConfirm={handleConfirm}
          onCancel={() => setOpen(false)}
        >
          <p>
            {[
              impact.spouseFamilyCount > 0 &&
                `配偶者とのつながり${impact.spouseFamilyCount}件`,
              impact.childLinkCount > 0 && `子の帰属${impact.childLinkCount}件`,
            ]
              .filter(Boolean)
              .join('・') || '他の人物との関係はありません。'}
            {(impact.spouseFamilyCount > 0 || impact.childLinkCount > 0) &&
              'も変更されます。'}
            {/* 家族ごと消えると婚姻日・離婚日も一緒に失われるため、承認前に明示する
                (spec tree-editor「人物・関係の削除」) */}
            {impact.removedFamilyEventCount > 0 &&
              `婚姻・離婚の記録${impact.removedFamilyEventCount}件も失われます。`}
            削除後すぐであれば「元に戻す」で復元できます。
          </p>
        </ConfirmDialog>
      )}
    </>
  )
}

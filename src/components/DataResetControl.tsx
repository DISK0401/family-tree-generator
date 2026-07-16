import { useId, useState } from 'react'
import { useTreeStore } from '../store/tree-store'
import './DataResetControl.css'
import './confirm-dialog.css'

const CONFIRM_PHRASE = '削除'

interface DataResetControlProps {
  onReset: () => Promise<void>
}

/**
 * 端末内データの全削除。取り消せない操作のため、影響範囲(人物・家族の件数)を提示し、
 * 確認フレーズの入力を必須にしたうえで実行する(design.md D5)。
 */
export function DataResetControl({ onReset }: DataResetControlProps) {
  const document = useTreeStore((s) => s.document)
  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const titleId = useId()
  const inputId = useId()

  const personCount = Object.keys(document.persons).length
  const familyCount = Object.keys(document.families).length
  const canConfirm = confirmText === CONFIRM_PHRASE

  function openDialog() {
    setConfirmText('')
    setOpen(true)
  }

  function closeDialog() {
    if (isDeleting) return
    setOpen(false)
  }

  async function handleConfirm() {
    if (!canConfirm || isDeleting) return
    setIsDeleting(true)
    await onReset()
    setIsDeleting(false)
    setOpen(false)
  }

  return (
    <>
      <button type="button" className="data-reset-trigger" onClick={openDialog}>
        すべてのデータを削除
      </button>
      {open && (
        <div className="confirm-dialog-overlay">
          <div
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <h2 id={titleId}>すべてのデータを削除しますか?</h2>
            <p>
              人物 {personCount} 件・家族 {familyCount} 件を含む、この端末に保存されている家系図データがすべて削除されます。この操作は取り消せません。
            </p>
            <label htmlFor={inputId}>
              続行するには「{CONFIRM_PHRASE}」と入力してください
            </label>
            <input
              id={inputId}
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
            />
            <div className="confirm-dialog-actions">
              <button type="button" onClick={closeDialog} disabled={isDeleting}>
                キャンセル
              </button>
              <button
                type="button"
                className="confirm-dialog-danger-button"
                disabled={!canConfirm || isDeleting}
                onClick={handleConfirm}
              >
                {isDeleting ? '削除中…' : '削除する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

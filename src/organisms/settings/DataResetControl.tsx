import { useId, useState } from 'react'
import { useTreeStore } from '../../store/tree-store'
import { ConfirmDialog } from '../../molecules/ConfirmDialog'
import './DataResetControl.css'
import { Button } from '../../atoms/Button'

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
  const [resetError, setResetError] = useState<string | null>(null)
  const inputId = useId()

  const personCount = Object.keys(document.persons).length
  const familyCount = Object.keys(document.families).length
  const canConfirm = confirmText === CONFIRM_PHRASE

  function openDialog() {
    setConfirmText('')
    setResetError(null)
    setOpen(true)
  }

  function closeDialog() {
    if (isDeleting) return
    setOpen(false)
  }

  async function handleConfirm() {
    if (!canConfirm || isDeleting) return
    setIsDeleting(true)
    setResetError(null)
    // onResetが失敗してもisDeletingを必ず戻す(監査 中10: 失敗時にダイアログが
    // 操作不能のまま残る問題)。失敗時はダイアログを開いたままエラーを表示する
    try {
      await onReset()
      setOpen(false)
    } catch (error) {
      console.error('データの削除に失敗しました', error)
      setResetError('削除に失敗しました。もう一度お試しください。')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <Button
        variant="menu-item"
        className="data-reset-trigger"
        onClick={openDialog}
      >
        すべてのデータを削除
      </Button>
      {open && (
        <ConfirmDialog
          title="すべてのデータを削除しますか？"
          alertdialog
          confirmLabel={isDeleting ? '削除中…' : '削除する'}
          confirmDanger
          confirmDisabled={!canConfirm || isDeleting}
          onConfirm={() => {
            // handleConfirm は失敗を内部で処理する(catch/finally 済み)ため投げっぱなしで安全
            void handleConfirm()
          }}
          cancelDisabled={isDeleting}
          onCancel={closeDialog}
        >
          <p>
            人物 {personCount} 件・家族 {familyCount}{' '}
            件を含む、この端末に保存されている家系図データがすべて削除されます。この操作は取り消せません。
          </p>
          <label htmlFor={inputId}>
            続行するには「{CONFIRM_PHRASE}」と入力してください
          </label>
          <input
            id={inputId}
            className="field field--sunken"
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoComplete="off"
            data-autofocus
          />
          {resetError && (
            <p role="alert" className="data-reset-error">
              {resetError}
            </p>
          )}
        </ConfirmDialog>
      )}
    </>
  )
}

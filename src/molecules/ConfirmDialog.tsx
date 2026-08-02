import { useId, useRef, type ReactNode } from 'react'
import { Button } from '../atoms/Button'
import { Dialog } from '../atoms/Dialog'
import './ConfirmDialog.css'

/** 3ボタン形(離脱確認等)用の中間アクション。キャンセルと確認ボタンの間に置く */
export interface ConfirmDialogExtraAction {
  label: string
  onSelect: () => void
  /** 破壊的な選択肢(朱系ソリッド)として描く */
  danger?: boolean
}

export interface ConfirmDialogProps {
  title: string
  /** 本文。DataReset の確認フレーズ入力のような追加フォームも差し込める */
  children: ReactNode
  /** 確認(実行)ボタンの文言。省略時は確認ボタン自体を描かない(閉じる操作だけのダイアログ) */
  confirmLabel?: string
  onConfirm?: () => void
  /** 確認ボタンを危険操作(朱系ソリッド)として描く。false は推奨アクション(藍) */
  confirmDanger?: boolean
  confirmDisabled?: boolean
  /** 確認ボタンへ初期フォーカスを置く(既定は安全側 = キャンセルボタン) */
  confirmAutoFocus?: boolean
  /** キャンセルボタンの文言(既定: キャンセル) */
  cancelLabel?: string
  /** 実行中などキャンセル不能な間 true(Esc も無効化される) */
  cancelDisabled?: boolean
  /** キャンセルボタン・Escキー(cancelイベント)共通の閉じる要求 */
  onCancel: () => void
  extraAction?: ConfirmDialogExtraAction
  /** 取り返しのつかない操作の確認は alertdialog として通知する */
  alertdialog?: boolean
  /** ダイアログ面への追加クラス(幅広ダイアログ等) */
  className?: string
}

/**
 * 確認ダイアログ。モーダルの機構(`showModal` / Esc / フォーカス復元)は
 * `atoms/Dialog` が持ち、ここは「見出し + 本文 + キャンセル/中間/確認の3ボタン」
 * という確認の型だけを与える。
 *
 * 初期フォーカスは安全側(キャンセル)を既定とし、`confirmAutoFocus` を立てたときは
 * 確認ボタンへ移す。本文に `[data-autofocus]`(確認フレーズ入力等)がある場合は
 * `Dialog` 側がそれを優先して拾う。
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  onConfirm,
  confirmDanger = false,
  confirmDisabled = false,
  confirmAutoFocus = false,
  cancelLabel,
  cancelDisabled = false,
  onCancel,
  extraAction,
  alertdialog = false,
  className,
}: ConfirmDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()

  const initialFocusRef = confirmAutoFocus ? confirmButtonRef : cancelButtonRef
  const surfaceClass = 'confirm-dialog surface--floating'

  return (
    <Dialog
      alertdialog={alertdialog}
      ariaLabelledBy={titleId}
      onCancel={onCancel}
      cancelDisabled={cancelDisabled}
      initialFocusRef={initialFocusRef}
      className={className ? `${surfaceClass} ${className}` : surfaceClass}
    >
      <h2 id={titleId}>{title}</h2>
      {children}
      <div className="confirm-dialog-actions">
        <Button
          variant="outline"
          ref={cancelButtonRef}
          onClick={onCancel}
          disabled={cancelDisabled}
        >
          {cancelLabel ?? 'キャンセル'}
        </Button>
        {extraAction ? (
          <Button
            variant={extraAction.danger ? 'danger' : 'outline'}
            onClick={extraAction.onSelect}
          >
            {extraAction.label}
          </Button>
        ) : null}
        {confirmLabel ? (
          <Button
            variant={confirmDanger ? 'danger' : 'primary'}
            ref={confirmButtonRef}
            disabled={confirmDisabled}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        ) : null}
      </div>
    </Dialog>
  )
}

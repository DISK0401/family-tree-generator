import { useEffect, useId, useRef, type ReactNode } from 'react'
import './confirm-dialog.css'

/** 3ボタン形(App の離脱確認等)用の中間アクション。キャンセルと確認ボタンの間に置く */
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
 * ネイティブ`<dialog>` + `showModal()`ベースの共通確認ダイアログ(監査 高3)。
 *
 * 従来の「固定オーバーレイ + role="dialog"のdiv」は、フォーカストラップ・Escキー・
 * 背景のinert化をどれも持たず、開いている間もTabで背景のUIへ抜けられた。
 * showModal()はこれらをブラウザ標準の挙動として備える(トップレイヤ表示のため
 * z-indexの管理も不要)。ネストして開いても合法にスタックする。
 *
 * 開閉は呼び出し側の条件レンダリングで表現する(open状態のprops同期は持たない)。
 * - マウント時に showModal() し、アンマウント時に close() + トリガーへフォーカスを戻す。
 *   実ブラウザはclose()で「showModal時にフォーカスを持っていた要素」へ戻すが、
 *   Reactのアンマウント(DOMごと除去)ではこの復元が走らない環境があるため明示的に戻す。
 * - Esc(cancelイベント)は既定のcloseをpreventDefault()で抑止し、onCancelへ委譲する
 *   (DOM側が勝手に閉じてReactの状態とねじれるのを防ぐ)。
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
  const dialogRef = useRef<HTMLDialogElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()

  // cancelイベントはマウント時に一度だけ張るネイティブリスナのため、最新のpropsをrefで参照する
  const onCancelRef = useRef(onCancel)
  const cancelDisabledRef = useRef(cancelDisabled)
  useEffect(() => {
    onCancelRef.current = onCancel
    cancelDisabledRef.current = cancelDisabled
  })

  const confirmAutoFocusRef = useRef(confirmAutoFocus)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    // showModal前にフォーカスを持っていた要素 = 開いたトリガー。閉じたらここへ戻す
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    if (!dialog.open) dialog.showModal()
    // 初期フォーカスの明示制御(実ブラウザ・jsdomの双方で決定的にする)。
    // 優先順: 確認ボタン指定 > 本文中の[data-autofocus](確認フレーズ入力等) > キャンセル(安全側)
    const target = confirmAutoFocusRef.current
      ? confirmButtonRef.current
      : (dialog.querySelector<HTMLElement>('[data-autofocus]') ??
        cancelButtonRef.current)
    target?.focus()

    const handleCancel = (e: Event) => {
      // DOM側のcloseは走らせず、閉じるかどうかは呼び出し元の状態(条件レンダリング)に委ねる
      e.preventDefault()
      if (!cancelDisabledRef.current) onCancelRef.current()
    }
    dialog.addEventListener('cancel', handleCancel)

    return () => {
      dialog.removeEventListener('cancel', handleCancel)
      if (dialog.open) dialog.close()
      if (opener?.isConnected) opener.focus()
    }
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className={className ? `confirm-dialog ${className}` : 'confirm-dialog'}
      role={alertdialog ? 'alertdialog' : undefined}
      aria-labelledby={titleId}
    >
      <h2 id={titleId}>{title}</h2>
      {children}
      <div className="confirm-dialog-actions">
        <button
          type="button"
          ref={cancelButtonRef}
          onClick={onCancel}
          disabled={cancelDisabled}
        >
          {cancelLabel ?? 'キャンセル'}
        </button>
        {extraAction ? (
          <button
            type="button"
            className={
              extraAction.danger ? 'confirm-dialog-danger-button' : undefined
            }
            onClick={extraAction.onSelect}
          >
            {extraAction.label}
          </button>
        ) : null}
        {confirmLabel ? (
          <button
            type="button"
            ref={confirmButtonRef}
            className={
              confirmDanger
                ? 'confirm-dialog-danger-button'
                : 'confirm-dialog-primary-button'
            }
            disabled={confirmDisabled}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        ) : null}
      </div>
    </dialog>
  )
}

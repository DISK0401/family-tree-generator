import { useEffect, useRef, type ReactNode, type RefObject } from 'react'

export interface DialogProps {
  children: ReactNode
  /** 取り返しのつかない操作の確認は `alertdialog` として通知する */
  alertdialog?: boolean
  /** 見出し要素の id(`aria-labelledby`) */
  ariaLabelledBy?: string
  /** キャンセル要求(Escキー = cancel イベント)。閉じるかどうかは呼び出し側の状態に委ねる */
  onCancel: () => void
  /** 実行中などキャンセル不能な間 true(Esc も無効化される) */
  cancelDisabled?: boolean
  /**
   * 初期フォーカスの第一候補。省略時は本文中の `[data-autofocus]`、
   * それも無ければダイアログ自身へ委ねる
   */
  initialFocusRef?: RefObject<HTMLElement | null>
  className?: string
}

/**
 * ネイティブ `<dialog>` + `showModal()` によるモーダルの土台(監査 高3)。
 *
 * 「固定オーバーレイ + `role="dialog"` の div」ではフォーカストラップ・Esc キー・
 * 背景の inert 化をどれも持てないが、`showModal()` はこれらをブラウザ標準の挙動として
 * 備える(トップレイヤ表示のため z-index の管理も不要)。ネストして開いても合法に
 * スタックする。
 *
 * 開閉は呼び出し側の条件レンダリングで表現する(open 状態の props 同期は持たない)。
 * - マウント時に `showModal()` し、アンマウント時に `close()` + トリガーへフォーカスを戻す。
 *   実ブラウザは `close()` で「`showModal` 時にフォーカスを持っていた要素」へ戻すが、
 *   React のアンマウント(DOM ごと除去)ではこの復元が走らない環境があるため明示的に戻す。
 * - Esc(cancel イベント)は既定の close を `preventDefault()` で抑止し、`onCancel` へ委譲する
 *   (DOM 側が勝手に閉じて React の状態とねじれるのを防ぐ)。
 *
 * ボタンの構成や文言は持たない(それは `molecules/ConfirmDialog` の役目)。
 */
export function Dialog({
  children,
  alertdialog = false,
  ariaLabelledBy,
  onCancel,
  cancelDisabled = false,
  initialFocusRef,
  className,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  // cancel イベントはマウント時に一度だけ張るネイティブリスナのため、最新の props を ref で参照する
  const onCancelRef = useRef(onCancel)
  const cancelDisabledRef = useRef(cancelDisabled)
  useEffect(() => {
    onCancelRef.current = onCancel
    cancelDisabledRef.current = cancelDisabled
  })

  const initialFocusRefRef = useRef(initialFocusRef)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    // showModal 前にフォーカスを持っていた要素 = 開いたトリガー。閉じたらここへ戻す
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    if (!dialog.open) dialog.showModal()
    // 初期フォーカスの明示制御(実ブラウザ・jsdom の双方で決定的にする)。
    // 優先順: 指定されたref > 本文中の [data-autofocus](確認フレーズ入力等)
    const target =
      initialFocusRefRef.current?.current ??
      dialog.querySelector<HTMLElement>('[data-autofocus]')
    target?.focus()

    const handleCancel = (e: Event) => {
      // DOM 側の close は走らせず、閉じるかどうかは呼び出し元の状態(条件レンダリング)に委ねる
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
      className={className}
      role={alertdialog ? 'alertdialog' : undefined}
      aria-labelledby={ariaLabelledBy}
    >
      {children}
    </dialog>
  )
}

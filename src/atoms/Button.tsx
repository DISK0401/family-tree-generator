import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'

/**
 * ボタンの役割。見た目の定義は `styles/primitives.css` の `.btn--*` にある。
 *
 * - `outline`: 枠線付き中立。最も多用する形
 * - `primary-soft`: 確定操作(淡)。フォーム内の「追加する」「保存」
 * - `primary`: 確定操作(強)。押せることを最も強く示す
 * - `danger`: 破壊的操作(強)
 * - `danger-outline`: 破壊的操作(枠線)
 * - `text`: 枠を持たない従属的な操作
 * - `menu-item`: メニュー内の行(全幅・左揃え)
 * - `ghost`: 枠を透明で確保し、ホバーで枠が現れる
 * - `bare`: 基本形のみ(色・枠は呼び出し側のクラスで与える)
 */
export type ButtonVariant =
  | 'outline'
  | 'primary-soft'
  | 'primary'
  | 'danger'
  | 'danger-outline'
  | 'text'
  | 'menu-item'
  | 'ghost'
  | 'bare'

export interface ButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'className'
> {
  variant?: ButtonVariant
  /**
   * UA 既定の行送りを保つ(`.btn--tight`)。基本形の `font: inherit` は
   * line-height も継承値(1.6)へ変えるため、詰まった高さを前提に組まれた
   * 箇所ではこれを立てる(design.md 付録 A 注意 1)
   */
  tight?: boolean
  /** 押下状態のトグルボタンとして扱う(`aria-pressed` を出す) */
  pressed?: boolean
  /** 見た目の差分を与えるコンポーネント固有のクラス */
  className?: string
  /** React 19 では関数コンポーネントでも ref を通常の props として受け取れる */
  ref?: Ref<HTMLButtonElement>
  children?: ReactNode
}

/**
 * `styles/primitives.css` の `.btn` を使う薄いラッパ。
 *
 * 素の `<button>` に対する利点は3つ:
 * - `type` の既定を `button` にする(フォーム内で意図せず submit しない)
 * - バリアント名を型で縛る(クラス名の打ち間違いを防ぐ)
 * - `pressed` を `aria-pressed` へ落とし、見た目と支援技術への通知を必ず一致させる
 *
 * ドメインを知らないため `atoms/` に属する(`domain/` を import しない)。
 */
export function Button({
  variant = 'bare',
  tight = false,
  pressed,
  className,
  type = 'button',
  ref,
  children,
  ...rest
}: ButtonProps) {
  const classes = ['btn']
  if (variant !== 'bare') classes.push(`btn--${variant}`)
  if (tight) classes.push('btn--tight')
  if (className) classes.push(className)
  return (
    <button
      type={type}
      ref={ref}
      className={classes.join(' ')}
      aria-pressed={pressed}
      {...rest}
    >
      {children}
    </button>
  )
}

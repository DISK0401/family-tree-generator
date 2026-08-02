import type { ElementType, ReactNode } from 'react'

/**
 * 面の性格。見た目の定義は `styles/primitives.css` の `.surface--*` にある。
 *
 * - `floating`: メニュー・ダイアログ・候補リスト(地から離れて手前に出る)
 * - `raised`: カード・フォームの箱(机上に置かれた紙)
 * - `sunken`: フォーム内のグループ(面より一段奥)
 * - `overlay`: 図の上に浮かぶ操作面(半透明+ぼかし)
 * - `notice`: 警告の箱
 * - `notice-danger`: 危険の箱
 * - `fieldset`: 枠付きグループ(`<fieldset>` と併用)
 */
export type SurfaceVariant =
  | 'floating'
  | 'raised'
  | 'sunken'
  | 'overlay'
  | 'notice'
  | 'notice-danger'
  | 'fieldset'

export interface SurfaceProps {
  variant: SurfaceVariant
  /** 描画する要素(既定: `div`)。`fieldset` や `ul` などにも使える */
  as?: ElementType
  className?: string
  children?: ReactNode
  /** 通知面など、支援技術へ即時に伝えたい場合に使う */
  role?: string
}

/**
 * 面(サーフェス)の薄いラッパ。`styles/primitives.css` の `.surface--*` を
 * 型付きの `variant` で指定できるようにするだけの部品。
 *
 * ドメインを知らないため `atoms/` に属する。
 */
export function Surface({
  variant,
  as: Tag = 'div',
  className,
  children,
  role,
}: SurfaceProps) {
  const classes = [`surface--${variant}`]
  if (className) classes.push(className)
  return (
    <Tag className={classes.join(' ')} role={role}>
      {children}
    </Tag>
  )
}

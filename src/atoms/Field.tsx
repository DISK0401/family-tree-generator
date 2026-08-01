import { useId, type ReactNode } from 'react'

export interface FieldProps {
  /** 見出し。`hideLabel` を立てると視覚的には隠し、読み上げには残す */
  label: string
  hideLabel?: boolean
  /** 入力欄。`id` と `aria-describedby` を受け取って描く */
  children: (props: {
    id: string
    'aria-describedby': string | undefined
  }) => ReactNode
  /** 補助表示(和暦⇄西暦の対応など)。`aria-describedby` で関連付く */
  hint?: ReactNode
  /** 補助表示の段落へ足すクラス */
  hintClassName?: string
  /** エラー表示。`hint` より優先して関連付け、`role="alert"` で通知する */
  error?: ReactNode
  /** エラー表示の段落へ足すクラス */
  errorClassName?: string
  /** 見出しと入力を横に並べる(設定メニューの行など) */
  row?: boolean
  className?: string
}

/**
 * 見出し・入力・補助表示/エラーの組を、関連付け(`htmlFor` /
 * `aria-describedby`)ごと1箇所で組み立てる部品。
 * 見た目は `styles/primitives.css` の `.field-label` / `.field` にある。
 *
 * 入力要素自体は `children` に委ねる(`<input>` / `<select>` / `<textarea>` の
 * どれか、また属性や `value` の持ち方が呼び出し側ごとに異なるため)。
 * ドメインを知らないため `atoms/` に属する。
 */
export function Field({
  label,
  hideLabel = false,
  children,
  hint,
  hintClassName,
  error,
  errorClassName,
  row = false,
  className,
}: FieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = error ? errorId : hint ? hintId : undefined

  const classes = ['field-label']
  if (row) classes.push('field-label--row')
  if (className) classes.push(className)

  return (
    <div className={classes.join(' ')}>
      <label htmlFor={id} className={hideLabel ? 'visually-hidden' : undefined}>
        {label}
      </label>
      {children({ id, 'aria-describedby': describedBy })}
      {hint && !error ? (
        <p id={hintId} className={hintClassName}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className={errorClassName} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

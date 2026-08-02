export interface SegmentedControlItem<T extends string> {
  value: T
  label: string
  /** 項目ごとの見た目の差分クラス(文字サイズ・折り返し等) */
  className?: string
}

export interface SegmentedControlProps<T extends string> {
  /** 支援技術に読ませる群の名前(`role="group"` の `aria-label`) */
  label: string
  items: readonly SegmentedControlItem<T>[]
  value: T
  onChange: (value: T) => void
  /**
   * 並びの向き。
   * - `framed`(既定): 枠でくるむ横並び(ヘッダの図/表、表の閲覧/編集)
   * - `stacked`: 縦積み。図の上に浮かぶ操作面として使うため外枠は `surfaceClassName` で与える
   */
  arrangement?: 'framed' | 'stacked'
  /** 外枠へ足すクラス(配置・`surface--overlay` 等) */
  className?: string
}

/**
 * 常にどれか 1 つが選ばれる切替。見た目は `styles/primitives.css` の
 * `.segmented` / `.segmented-item` にある。
 *
 * 「外枠でくるむ(または縦積みの操作面として束ねる)」構造と「排他選択」の
 * 意味論を共有する 3 箇所を 1 部品にまとめたもの(design.md 付録 C)。
 * 外枠を持たないトグルボタンの集まり(`PersonPanel` の関係アクション等)は
 * ここへ寄せず `Button` の `pressed` で表す。
 *
 * 選択の通知は `aria-pressed` で行う(`role="tab"` にはしない)。タブは
 * 対応する `tabpanel` の存在を前提とする役割であり、ここでは図と表のように
 * 別の領域を出し分けるだけで `tabpanel` の関係を持たないため。
 */
export function SegmentedControl<T extends string>({
  label,
  items,
  value,
  onChange,
  arrangement = 'framed',
  className,
}: SegmentedControlProps<T>) {
  const classes = ['segmented', `segmented--${arrangement}`]
  if (className) classes.push(className)
  return (
    <div className={classes.join(' ')} role="group" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          className={
            item.className
              ? `segmented-item ${item.className}`
              : 'segmented-item'
          }
          aria-pressed={value === item.value}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

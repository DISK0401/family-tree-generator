import './ZoomControls.css'

export interface ZoomControlsProps {
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
}

/**
 * キャンバス右下のズーム操作(拡大・縮小・画面に合わせる)。
 * family-chart(FamilyTreeCanvas)とPedigreeCanvasでJSX・CSSが重複していたため
 * 共通化した(監査 低6)。ズームの実装(d3 / viewBox)は呼び出し側が持ち、
 * このコンポーネントは操作面だけを提供する。
 */
export function ZoomControls({
  onZoomIn,
  onZoomOut,
  onFit,
}: ZoomControlsProps) {
  return (
    <div
      className="segmented segmented--stacked surface--overlay zoom-controls"
      role="group"
      aria-label="表示倍率"
    >
      <button
        type="button"
        className="segmented-item"
        onClick={onZoomIn}
        aria-label="拡大"
      >
        +
      </button>
      <button
        type="button"
        className="segmented-item"
        onClick={onZoomOut}
        aria-label="縮小"
      >
        −
      </button>
      <button
        type="button"
        className="segmented-item"
        onClick={onFit}
        aria-label="画面に合わせる"
      >
        ⊡
      </button>
    </div>
  )
}

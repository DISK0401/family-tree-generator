import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { SAMPLE_METAS, type SampleId } from '../../samples/sample-meta'
import { SAMPLE_FIGURES } from './figures'
import { TreeFigure } from './TreeFigure'

/**
 * 偉人家系図サンプルのギャラリー(specs/sample-tree-gallery)。
 * タブでサンプルを切り替え、静的SVG図版・パターン説明・注記・
 * 「このサンプルをエディタで開く」導線(/app?sample=<id>)を表示する。
 *
 * a11y(監査 低10): tablistの標準操作に合わせ、タブ間は矢印キーで移動する
 * roving tabindex(選択中のタブだけTab順に入る)を実装する。
 */
export function SampleGallery() {
  const [selectedId, setSelectedId] = useState<SampleId>('tokugawa-ieyasu')
  const baseId = useId()
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const selected =
    SAMPLE_METAS.find((m) => m.id === selectedId) ?? SAMPLE_METAS[0]

  function moveTo(index: number) {
    const meta = SAMPLE_METAS[index]
    if (!meta) return
    setSelectedId(meta.id)
    tabRefs.current[index]?.focus()
  }

  function handleTabKeyDown(
    e: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    const last = SAMPLE_METAS.length - 1
    let next: number | null = null
    if (e.key === 'ArrowRight') next = index === last ? 0 : index + 1
    else if (e.key === 'ArrowLeft') next = index === 0 ? last : index - 1
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = last
    if (next === null) return
    e.preventDefault()
    moveTo(next)
  }

  return (
    <div className="sample-gallery">
      <div
        className="sample-gallery-tabs"
        role="tablist"
        aria-label="サンプルの選択"
      >
        {SAMPLE_METAS.map((meta, index) => (
          <button
            key={meta.id}
            type="button"
            role="tab"
            id={`${baseId}-tab-${meta.id}`}
            ref={(el) => {
              tabRefs.current[index] = el
            }}
            aria-selected={meta.id === selected.id}
            aria-controls={`${baseId}-panel`}
            tabIndex={meta.id === selected.id ? 0 : -1}
            className="btn sample-gallery-tab"
            onClick={() => setSelectedId(meta.id)}
            onKeyDown={(e) => handleTabKeyDown(e, index)}
          >
            {meta.tabLabel}
            <span className="sample-gallery-tab-pattern">{meta.pattern}</span>
          </button>
        ))}
      </div>
      <div
        className="sample-gallery-panel surface--raised"
        role="tabpanel"
        id={`${baseId}-panel`}
        aria-labelledby={`${baseId}-tab-${selected.id}`}
      >
        <div className="sample-gallery-figure">
          <TreeFigure
            figure={SAMPLE_FIGURES[selected.id]}
            title={`${selected.title}の図版`}
          />
        </div>
        <div className="sample-gallery-detail">
          <h3>{selected.title}</h3>
          <p className="sample-gallery-description">{selected.description}</p>
          <p className="sample-gallery-note">{selected.note}</p>
          <a
            className="sample-gallery-open"
            href={`/app?sample=${selected.id}`}
          >
            このサンプルをエディタで開く
          </a>
        </div>
      </div>
    </div>
  )
}

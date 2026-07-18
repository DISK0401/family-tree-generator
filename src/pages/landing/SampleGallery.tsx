import { useId, useState } from 'react'
import { SAMPLE_METAS, type SampleId } from '../../samples/sample-meta'
import { SAMPLE_FIGURES } from './figures'
import { TreeFigure } from './TreeFigure'

/**
 * 偉人家系図サンプルのギャラリー(specs/sample-tree-gallery)。
 * タブでサンプルを切り替え、静的SVG図版・パターン説明・注記・
 * 「このサンプルをエディタで開く」導線(/app?sample=<id>)を表示する。
 */
export function SampleGallery() {
  const [selectedId, setSelectedId] = useState<SampleId>('tokugawa-ieyasu')
  const baseId = useId()
  const selected =
    SAMPLE_METAS.find((m) => m.id === selectedId) ?? SAMPLE_METAS[0]

  return (
    <div className="sample-gallery">
      <div
        className="sample-gallery-tabs"
        role="tablist"
        aria-label="サンプルの選択"
      >
        {SAMPLE_METAS.map((meta) => (
          <button
            key={meta.id}
            type="button"
            role="tab"
            id={`${baseId}-tab-${meta.id}`}
            aria-selected={meta.id === selected.id}
            aria-controls={`${baseId}-panel`}
            className="sample-gallery-tab"
            onClick={() => setSelectedId(meta.id)}
          >
            {meta.tabLabel}
            <span className="sample-gallery-tab-pattern">{meta.pattern}</span>
          </button>
        ))}
      </div>
      <div
        className="sample-gallery-panel"
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

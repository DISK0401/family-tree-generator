/*
 * ランディング用の家系図図版(design.md D3/D8)。
 * 事前定義したノード座標と系線ポリラインを描くだけの軽量SVGで、
 * family-chart/D3には依存しない。色はすべてCSSトークン参照(テーマ追従)。
 */

export const FIGURE_NODE_WIDTH = 110
export const FIGURE_NODE_HEIGHT = 48

export interface FigureNode {
  x: number
  y: number
  label: string
  sub?: string
  /** 系図の中心人物。朱の枠で強調する */
  emphasis?: boolean
}

export interface FigureEdge {
  points: Array<[number, number]>
  /** 養子縁組の系線(エディタと同じく破線で描き分ける) */
  dashed?: boolean
}

export interface FigureAnnotation {
  x: number
  y: number
  text: string
}

export interface FigureData {
  width: number
  height: number
  nodes: FigureNode[]
  edges: FigureEdge[]
  annotations?: FigureAnnotation[]
}

export function TreeFigure({
  figure,
  title,
}: {
  figure: FigureData
  title: string
}) {
  return (
    <svg
      className="tree-figure"
      viewBox={`0 0 ${figure.width} ${figure.height}`}
      role="img"
      aria-label={title}
      preserveAspectRatio="xMidYMid meet"
    >
      {figure.edges.map((edge, i) => (
        <polyline
          key={`e${i}`}
          className={
            edge.dashed
              ? 'tree-figure-edge tree-figure-edge-dashed'
              : 'tree-figure-edge'
          }
          points={edge.points.map((p) => p.join(',')).join(' ')}
        />
      ))}
      {figure.annotations?.map((a, i) => (
        <text
          key={`a${i}`}
          className="tree-figure-annotation"
          x={a.x}
          y={a.y}
          textAnchor="middle"
        >
          {a.text}
        </text>
      ))}
      {figure.nodes.map((node, i) => (
        <g
          key={`n${i}`}
          className={
            node.emphasis
              ? 'tree-figure-node tree-figure-node-emphasis'
              : 'tree-figure-node'
          }
        >
          <rect
            x={node.x}
            y={node.y}
            width={FIGURE_NODE_WIDTH}
            height={FIGURE_NODE_HEIGHT}
            rx={2}
          />
          <text
            x={node.x + FIGURE_NODE_WIDTH / 2}
            y={node.y + (node.sub ? 20 : 29)}
            textAnchor="middle"
            className="tree-figure-name"
          >
            {node.label}
          </text>
          {node.sub ? (
            <text
              x={node.x + FIGURE_NODE_WIDTH / 2}
              y={node.y + 37}
              textAnchor="middle"
              className="tree-figure-sub"
            >
              {node.sub}
            </text>
          ) : null}
        </g>
      ))}
    </svg>
  )
}

/**
 * 空状態の背景に薄く敷く、完成イメージのゴーストプレビュー。
 * 縦書きカードという最大の売りを、入力前のユーザーにも伝える(Fableレビュー反映)。
 * 装飾のみで操作対象にはしない。
 */
const CARD_W = 40
const CARD_H = 56

const CARDS = [
  { x: 40, y: 10, given: '廣太郎' },
  { x: 110, y: 10, given: '靜子' },
  { x: 75, y: 100, given: '一郎' },
  { x: 145, y: 100, given: '花子' },
  { x: 110, y: 190, given: '翔' },
] as const

export function EmptyStateGhostPreview() {
  return (
    <svg
      className="empty-state-ghost"
      viewBox="0 0 220 260"
      aria-hidden="true"
      focusable="false"
    >
      {/* 婚姻線(第1世代・第2世代) */}
      <line x1={40 + CARD_W} y1={10 + CARD_H / 2} x2={110} y2={10 + CARD_H / 2} className="empty-state-ghost-line" />
      <line x1={75 + CARD_W} y1={100 + CARD_H / 2} x2={145} y2={100 + CARD_H / 2} className="empty-state-ghost-line" />
      {/* 親子線 */}
      <line x1={95} y1={10 + CARD_H} x2={95} y2={100} className="empty-state-ghost-line" />
      <line x1={130} y1={100 + CARD_H} x2={130} y2={190} className="empty-state-ghost-line" />
      {CARDS.map((c) => (
        <foreignObject key={c.given} x={c.x} y={c.y} width={CARD_W} height={CARD_H}>
          <div className="empty-state-ghost-card">
            <span>{c.given}</span>
          </div>
        </foreignObject>
      ))}
    </svg>
  )
}

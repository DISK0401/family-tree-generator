import f3, { type TreeDatum } from 'family-chart'
import 'family-chart/styles/family-chart.css'
import { useEffect, useRef } from 'react'
import { useTreeStore } from '../store/tree-store'
import { toFamilyChartData, type FamilyChartDatum } from './to-family-chart-data'
import './FamilyTreeCanvas.css'

// family-chartはDatumの構造を緩く型付けしているため、ここでのみ緩い型を使う
type ChartInstance = ReturnType<typeof f3.createChart>

// カード寸法。setCardHtml()にsetCardInnerHtmlCreatorを渡すとfamily-chart側の
// カードサイズCSS(.f3 div.card-rect 等)は適用されないため、ここで定義した値を
// setCardDim(レイアウト計算用)とCSS(.tree-card の実サイズ)の両方に用いる
const CARD_WIDTH = 96
const CARD_HEIGHT = 150

export interface FamilyTreeCanvasProps {
  selectedPersonId: string | null
  onSelectPerson: (personId: string | null) => void
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
}

/** 氏名は利用者入力のため、innerHTMLへ渡す前に必ずエスケープする */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/**
 * family-chartによる家系図キャンバス。
 * TreeDocumentの変更を購読し、toFamilyChartDataで射影した結果のみで再描画する
 * (family-chart側のデータを保存・編集の正本にしない。design.md D1/D2)。
 */
export function FamilyTreeCanvas({ selectedPersonId, onSelectPerson }: FamilyTreeCanvasProps) {
  const document = useTreeStore((s) => s.document)
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ChartInstance | null>(null)
  const selectedIdRef = useRef<string | null>(selectedPersonId)
  const onSelectPersonRef = useRef(onSelectPerson)

  useEffect(() => {
    selectedIdRef.current = selectedPersonId
  }, [selectedPersonId])

  useEffect(() => {
    onSelectPersonRef.current = onSelectPerson
  }, [onSelectPerson])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const initialData = toFamilyChartData(document) as unknown as never
    const chart = f3
      .createChart(container, initialData)
      .setTransitionTime(prefersReducedMotion() ? 0 : 700)
      .setCardYSpacing(170)
      .setCardXSpacing(180)
      .setSingleParentEmptyCard(false)
    chartRef.current = chart

    const card = chart.setCardHtml()
    card.setStyle('rect')
    card.setCardDim({ w: CARD_WIDTH, h: CARD_HEIGHT, img: false })
    card.setOnCardClick((_e: Event, d: TreeDatum) => {
      const personId = (d.data as unknown as FamilyChartDatum).data.personId
      onSelectPersonRef.current(personId === selectedIdRef.current ? null : personId)
    })
    card.setCardInnerHtmlCreator((d: TreeDatum) => {
      const person = (d.data as unknown as FamilyChartDatum).data
      const selected = person.personId === selectedIdRef.current
      const genderClass = person.gender === 'F' ? ' female' : ''
      const selectedClass = selected ? ' selected' : ''
      const years = [person.birthYear, person.deathYear].filter((y) => y !== undefined).join('–')
      // 姓・名は別の縦書き列として描く(位牌・表札に倣う伝統的な書式。design.md D6)。
      // どちらか一方しかない場合は単一列にフォールバックする
      const nameHtml =
        person.surname && person.given
          ? `<div class="tree-card-surname">${escapeHtml(person.surname)}</div><div class="tree-card-given">${escapeHtml(person.given)}</div>`
          : `<div class="tree-card-given">${escapeHtml(person.displayName)}</div>`
      return `<div class="tree-card${genderClass}${selectedClass}">
        ${nameHtml}
        ${years ? `<div class="tree-card-years">${escapeHtml(years)}</div>` : ''}
      </div>`
    })

    chart.updateTree({ initial: true, tree_position: 'fit' })

    return () => {
      container.replaceChildren()
      chartRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.updateData(toFamilyChartData(document) as unknown as never)
    // 人物追加のたびに全体を視界に収める(競合の「レイアウトが崩れる/迷子になる」不満への対応)
    chart.updateTree({ tree_position: 'fit' })
  }, [document])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.updateTree({ tree_position: 'inherit', transition_time: 0 })
  }, [selectedPersonId])

  // "f3" はfamily-chart本体のCSS(family-chart.css)が前提とするスコープクラス
  return (
    <div
      ref={containerRef}
      className="f3 tree-canvas-root"
      style={{ ['--tree-card-w' as string]: `${CARD_WIDTH}px`, ['--tree-card-h' as string]: `${CARD_HEIGHT}px` }}
    />
  )
}

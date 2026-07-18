import f3, { type TreeDatum } from 'family-chart'
import 'family-chart/styles/family-chart.css'
import { useEffect, useRef, useState } from 'react'
import { useTreeStore } from '../store/tree-store'
import type { Pedigree } from '../domain/types'
import {
  buildPedigreeByEdge,
  compareChildrenByBirthThenName,
  computeHiddenCounts,
  findMaxCoverageRoot,
  findRootAncestor,
  sortSpousesByMarriageDate,
  toFamilyChartData,
  type FamilyChartDatum,
} from './to-family-chart-data'
import './FamilyTreeCanvas.css'

// family-chartはDatumの構造を緩く型付けしているため、ここでのみ緩い型を使う
type ChartInstance = ReturnType<typeof f3.createChart>
type SortChildrenFn = Parameters<ChartInstance['setSortChildrenFunction']>[0]
type SortSpousesFn = Parameters<ChartInstance['setSortSpousesFunction']>[0]

// カード寸法。setCardHtml()にsetCardInnerHtmlCreatorを渡すとfamily-chart側の
// カードサイズCSS(.f3 div.card-rect 等)は適用されないため、ここで定義した値を
// setCardDim(レイアウト計算用)とCSS(.tree-card の実サイズ)の両方に用いる
const CARD_WIDTH = 96
const CARD_HEIGHT = 108

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

/**
 * family-chartのリンク要素(SVG path)のD3データ形状。
 * `Link`型は公開APIのexportsマップに含まれないため、必要な形だけをローカルに定義する
 * (実体はlayout/create-links.tsのLinkと同一)。
 */
interface LinkDatum {
  source: TreeDatum | TreeDatum[]
  target: TreeDatum | TreeDatum[]
  /** 婚姻線であることを示すfamily-chart内部フラグ */
  spouse?: boolean
  /**
   * 祖先方向(選択人物→親)の辺かどうか。createLinksの実装上、祖先方向は
   * source=子・target=親、子孫方向(親→子)はsource=親・target=子と向きが逆になるため、
   * どちらが親でどちらが子かを判定するのに必須(handlers.ts参照)
   */
  is_ancestry?: boolean
}

function personIdOf(node: TreeDatum | undefined): string | undefined {
  return (node?.data as unknown as FamilyChartDatum | undefined)?.data.personId
}

/**
 * 系線への意味づけ: 養子は破線、婚姻線は二重線(伝統的な系図記法)。
 * D3が管理する既存ノードへclassList.toggleするだけに留め、DOM構造(ノード数)を
 * 変更しない(cloneNode等で複製すると次回updateTreeのD3データ結合が壊れるため)。
 * 二重線自体はCSSの drop-shadow(0 3px 0 ...) で複製せず表現する。
 *
 * 続柄は人物単位ではなく、辺(具体的にどの親とどの子を結ぶ線か)単位で判定する
 * (`pedigreeByEdge`)。1人が複数の家族に子として属する場合(実親+養親等)、
 * 主たる家族でない側の辺(例: 実親側)まで一律「養子スタイル」になってしまう不具合を
 * 防ぐため(design.md D2 / リスク「family-chartの表現力限界」)。
 */
function markLinkStyles(container: HTMLElement, pedigreeByEdge: Map<string, Pedigree>): void {
  const links = container.querySelectorAll<SVGPathElement>('path.link')
  links.forEach((el) => {
    const datum = (el as unknown as { __data__?: LinkDatum }).__data__
    if (!datum) return
    let isNonBiological = false
    if (!datum.spouse) {
      const childNodes = datum.is_ancestry ? datum.source : datum.target
      const parentNodes = datum.is_ancestry ? datum.target : datum.source
      const children = (Array.isArray(childNodes) ? childNodes : [childNodes]).map(personIdOf)
      const parents = (Array.isArray(parentNodes) ? parentNodes : [parentNodes]).map(personIdOf)
      isNonBiological = children.some((childId) =>
        parents.some((parentId) => {
          if (!childId || !parentId) return false
          const pedigree = pedigreeByEdge.get(`${parentId}|${childId}`)
          return pedigree !== undefined && pedigree !== 'biological'
        }),
      )
    }
    el.classList.toggle('adopted-link', isNonBiological)
    el.classList.toggle('spouse-link', datum.spouse === true)
  })
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
  const documentRef = useRef(document)
  // 全体表示モード(design.md D5): 折りたたみ(main_idのクリック追従)を止め、
  // 本人の兄弟姉妹も含めて描画可能な最大範囲を常に表示する
  const [showAll, setShowAll] = useState(false)
  const showAllRef = useRef(showAll)

  useEffect(() => {
    selectedIdRef.current = selectedPersonId
  }, [selectedPersonId])

  useEffect(() => {
    documentRef.current = document
  }, [document])

  useEffect(() => {
    showAllRef.current = showAll
  }, [showAll])

  useEffect(() => {
    onSelectPersonRef.current = onSelectPerson
  }, [onSelectPerson])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const initialData = toFamilyChartData(document) as unknown as never
    // 子・配偶者の並び順は決定的な比較関数として実装し、`main_id`(視点)には依存させない
    // (design.md D1: 性別未設定時にクリックで並び順が入れ替わるバグの修正を兼ねる)
    const sortChildren: SortChildrenFn = (a, b) =>
      compareChildrenByBirthThenName(a as unknown as FamilyChartDatum, b as unknown as FamilyChartDatum)
    const sortSpouses: SortSpousesFn = (d) =>
      sortSpousesByMarriageDate(documentRef.current, d as unknown as FamilyChartDatum)
    const chart = f3
      .createChart(container, initialData)
      .setTransitionTime(prefersReducedMotion() ? 0 : 700)
      .setCardYSpacing(170)
      .setCardXSpacing(180)
      .setSingleParentEmptyCard(false)
      .setSortChildrenFunction(sortChildren)
      .setSortSpousesFunction(sortSpouses)
    chartRef.current = chart

    // 折りたたみ時の非表示人数バッジ(design.md D6)。カード描画のたびに毎回計算し直すと
    // O(人数^2)になるため、直前に使った`store.getTree()`の参照が変わっていない間は使い回す
    let hiddenCountsCache: { tree: unknown; counts: Map<string, number> } | null = null
    function getHiddenCounts(): Map<string, number> {
      if (showAllRef.current) return new Map()
      const tree = chart.store.getTree()
      if (hiddenCountsCache && hiddenCountsCache.tree === tree) return hiddenCountsCache.counts
      const visibleIds = new Set(
        (tree?.data ?? []).map((td) => (td.data as unknown as FamilyChartDatum).data.personId),
      )
      const counts = computeHiddenCounts(documentRef.current, visibleIds)
      hiddenCountsCache = { tree, counts }
      return counts
    }

    const card = chart.setCardHtml()
    card.setStyle('rect')
    card.setCardDim({ w: CARD_WIDTH, h: CARD_HEIGHT, img: false })
    card.setOnCardClick((_e: Event, d: TreeDatum) => {
      const personId = (d.data as unknown as FamilyChartDatum).data.personId
      const nextSelected = personId === selectedIdRef.current ? null : personId
      // family-chartは初期main_id(最初に作成した人物)の祖先側ノードの配偶者・傍系親族を
      // 描画しない制約があるため、選択人物の最上位祖先へmain_idを追従させる
      // (選択人物自身をmain_idにすると、選択人物からさらに上の祖先の配偶者や
      // 傍系親族が今度は描画から漏れてしまうため。design.md リスク「family-chartの表現力限界」参照)。
      // 全体表示モード中は視点(表示範囲)を固定するため、main_idを動かさない(design.md D5)
      if (nextSelected && !showAllRef.current) {
        chart.updateMainId(findRootAncestor(documentRef.current, nextSelected))
      }
      onSelectPersonRef.current(nextSelected)
    })
    card.setCardInnerHtmlCreator((d: TreeDatum) => {
      const person = (d.data as unknown as FamilyChartDatum).data
      // 選択状態は朱で表現する(朱=選択の一意性を保つため、他の用途に流用しない)。
      // 性別インジケーターは朱と別配色のトークンを使う(design.md D7)
      const selectedClass = person.personId === selectedIdRef.current ? ' selected' : ''
      const years = [person.birthYear, person.deathYear].filter((y) => y !== undefined).join(' – ')
      const ageLabel =
        person.age !== undefined ? `(${person.deathYear !== undefined ? '没' : ''}${person.age}歳)` : ''
      // 姓・名は別の縦書き列として描く(位牌・表札に倣う伝統的な書式。design.md D6)。
      // どちらか一方しかない場合は単一列にフォールバックする
      const nameHtml =
        person.surname && person.given
          ? `<div class="tree-card-surname">${escapeHtml(person.surname)}</div><div class="tree-card-given">${escapeHtml(person.given)}</div>`
          : `<div class="tree-card-given">${escapeHtml(person.displayName)}</div>`
      // 折りたたみ表示時、この人物の先に隠れている人数をバッジで示す(design.md D6)。
      // 全体表示モード中は表示しない
      const hiddenCount = getHiddenCounts().get(person.personId)
      const badgeHtml =
        hiddenCount !== undefined
          ? `<div class="tree-card-hidden-badge" title="非表示の人物が${hiddenCount}人います">+${hiddenCount}</div>`
          : ''
      // 性別を色のみに依存せず形状(四角/丸/破線ひし形)でも判別できるようにする(design.md D7)
      const genderClass =
        person.gender === 'M' ? 'tree-card-gender-male' : person.gender === 'F' ? 'tree-card-gender-female' : 'tree-card-gender-unknown'
      const genderTitle = person.gender === 'M' ? '男' : person.gender === 'F' ? '女' : '性別不明'
      const genderHtml = `<div class="tree-card-gender ${genderClass}" title="${genderTitle}"></div>`
      return `<div class="tree-card${selectedClass}">
        ${genderHtml}
        ${badgeHtml}
        <div class="tree-card-name-row">${nameHtml}</div>
        ${years ? `<div class="tree-card-years">${escapeHtml(years)}${ageLabel ? ` ${escapeHtml(ageLabel)}` : ''}</div>` : ''}
      </div>`
    })

    // 系線の意味づけ: 養子は破線、婚姻線は二重線。updateTreeのたびに再適用が必要
    chart.setAfterUpdate(() => markLinkStyles(container, buildPedigreeByEdge(documentRef.current)))

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

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.setShowSiblingsOfMain(showAll)
    if (showAll) {
      // 有効化した瞬間の最大連結範囲の根へ視点を固定する(design.md D5)。
      // 以降はクリックしてもこの視点(main_id)を動かさない
      const root = findMaxCoverageRoot(documentRef.current)
      if (root) chart.updateMainId(root)
    }
    chart.updateTree({ tree_position: 'fit' })
  }, [showAll])

  function zoomBy(amount: number) {
    const chart = chartRef.current
    if (!chart) return
    f3.handlers.manualZoom({ amount, svg: chart.svg, transition_time: 200 })
  }

  function fitToView() {
    const chart = chartRef.current
    if (!chart) return
    chart.updateTree({ tree_position: 'fit' })
  }

  // "f3" はfamily-chart本体のCSS(family-chart.css)が前提とするスコープクラス。
  // 凡例・ズームコントロールはfamily-chartが管理するDOM(containerRef配下)の外、兄弟要素として置く
  return (
    <div
      className="tree-canvas-wrapper"
      style={{ ['--tree-card-w' as string]: `${CARD_WIDTH}px`, ['--tree-card-h' as string]: `${CARD_HEIGHT}px` }}
    >
      <div ref={containerRef} className="f3 tree-canvas-root" />
      <div className="tree-legend">
        <div className="tree-legend-item">
          <span className="tree-legend-swatch" />
          <span>実子</span>
        </div>
        <div className="tree-legend-item">
          <span className="tree-legend-swatch adopted" />
          <span>養子・継子・里子・不明</span>
        </div>
        <p className="tree-legend-hint">カードを選ぶと編集できます</p>
      </div>
      <div className="tree-mode-controls">
        <button
          type="button"
          className="tree-show-all-toggle"
          aria-pressed={showAll}
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? '折りたたみ表示に戻す' : '全体表示モード'}
        </button>
      </div>
      <div className="tree-zoom-controls" role="group" aria-label="表示倍率">
        <button type="button" onClick={() => zoomBy(1.3)} aria-label="拡大">
          +
        </button>
        <button type="button" onClick={() => zoomBy(1 / 1.3)} aria-label="縮小">
          −
        </button>
        <button type="button" onClick={fitToView} aria-label="画面に合わせる">
          ⊡
        </button>
      </div>
    </div>
  )
}

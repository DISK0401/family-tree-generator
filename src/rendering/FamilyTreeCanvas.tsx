import f3, { type TreeDatum } from 'family-chart'
import 'family-chart/styles/family-chart.css'
import { useEffect, useRef, useState } from 'react'
import { useTreeStore } from '../store/tree-store'
import type { Pedigree, TreeDocument } from '../domain/types'
import { useDisplaySettingsStore } from '../settings/display-settings-store'
import { formatDateForDisplay, type CalendarMode } from '../settings/display-settings'
import {
  buildPedigreeByEdge,
  compareChildrenByBirthThenName,
  computeHiddenCounts,
  findRootAncestor,
  FULL_VIEW_ROOT_ID,
  marriageDate,
  sortSpousesByMarriageDate,
  toFamilyChartData,
  toFullViewFamilyChartData,
  type FamilyChartDatum,
  type HiddenNeighborInfo,
} from './to-family-chart-data'
import './FamilyTreeCanvas.css'

// family-chartはDatumの構造を緩く型付けしているため、ここでのみ緩い型を使う
type ChartInstance = ReturnType<typeof f3.createChart>
type SortChildrenFn = Parameters<ChartInstance['setSortChildrenFunction']>[0]
type SortSpousesFn = Parameters<ChartInstance['setSortSpousesFunction']>[0]

// カード寸法。setCardHtml()にsetCardInnerHtmlCreatorを渡すとfamily-chart側の
// カードサイズCSS(.f3 div.card-rect 等)は適用されないため、ここで定義した値を
// setCardDim(レイアウト計算用)とCSS(.tree-card の実サイズ)の両方に用いる
const CARD_WIDTH = 104
const CARD_HEIGHT = 116

// 婚姻線ラベル(design.md D9)を線の真上ではなく少し上に浮かせるためのオフセット(px)
const MARRIAGE_LABEL_Y_OFFSET = 8

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
 *
 * 全体表示モード(design.md D5)の仮想ルート(`FULL_VIEW_ROOT_ID`)とその子(=各家系の根)を
 * つなぐ線は実在の関係ではないため、`virtual-root-link`クラスを付けてCSS側で非表示にする。
 */
function markLinkStyles(container: HTMLElement, pedigreeByEdge: Map<string, Pedigree>): void {
  const links = container.querySelectorAll<SVGPathElement>('path.link')
  links.forEach((el) => {
    const datum = (el as unknown as { __data__?: LinkDatum }).__data__
    if (!datum) return
    const sourceNodes = Array.isArray(datum.source) ? datum.source : [datum.source]
    const targetNodes = Array.isArray(datum.target) ? datum.target : [datum.target]
    const isVirtualRootLink = [...sourceNodes, ...targetNodes]
      .map(personIdOf)
      .some((id) => id === FULL_VIEW_ROOT_ID)
    let isNonBiological = false
    if (!datum.spouse && !isVirtualRootLink) {
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
    el.classList.toggle('virtual-root-link', isVirtualRootLink)
  })
}

/**
 * 婚姻線(`.spouse-link`、`markLinkStyles`が付与)の中点にSVG `<text>`で婚姻日ラベルを描く
 * (design.md D9)。family-chart本体の改修は不要で、標準SVG API(`getTotalLength`/
 * `getPointAtLength`)で線の中点座標を取得し、pathと同じ親要素(`g.links_view`相当)に
 * text要素を挿入するだけで、追加の座標変換なしに正しい位置へ描画できる(実機スパイクで確認済み)。
 *
 * family-chartのD3データ結合でpath要素が再生成される場合があるため、差分更新はせず、
 * 呼び出しのたびに前回挿入したラベル(`data-marriage-label`属性で識別)を全て除去してから
 * 作り直す(婚姻線の本数は家系図の規模に対して少なく、毎回の再構築で性能上の問題はない)。
 */
function renderMarriageLinkLabels(
  container: HTMLElement,
  doc: TreeDocument,
  options: { show: boolean; calendarMode: CalendarMode },
): void {
  const svgNS = 'http://www.w3.org/2000/svg'
  container.querySelectorAll('[data-marriage-label]').forEach((el) => el.remove())
  if (!options.show) return

  const links = container.querySelectorAll<SVGPathElement>('path.link.spouse-link')
  links.forEach((path) => {
    const datum = (path as unknown as { __data__?: LinkDatum }).__data__
    if (!datum) return
    const sourceIds = (Array.isArray(datum.source) ? datum.source : [datum.source]).map(personIdOf)
    const targetIds = (Array.isArray(datum.target) ? datum.target : [datum.target]).map(personIdOf)
    const personAId = sourceIds.find((id): id is string => !!id && id !== FULL_VIEW_ROOT_ID)
    const personBId = targetIds.find((id): id is string => !!id && id !== FULL_VIEW_ROOT_ID)
    if (!personAId || !personBId) return

    const date = marriageDate(doc, personAId, personBId)
    if (!date) return
    // 粒度設定は新設せず常にフル精度で表示し、和暦表示モードには追従する(design.md D9)
    const label = formatDateForDisplay(date, 'full', options.calendarMode)
    if (!label) return

    const length = path.getTotalLength()
    const midpoint = path.getPointAtLength(length / 2)
    const text = document.createElementNS(svgNS, 'text')
    text.setAttribute('data-marriage-label', '1')
    text.setAttribute('class', 'tree-marriage-label')
    text.setAttribute('x', String(midpoint.x))
    // 線の真上に重なると読みにくいため、線より少し上に浮かせて表示する
    text.setAttribute('y', String(midpoint.y - MARRIAGE_LABEL_Y_OFFSET))
    text.textContent = label
    path.parentElement?.appendChild(text)
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
export function FamilyTreeCanvas({
  selectedPersonId,
  onSelectPerson,
}: FamilyTreeCanvasProps) {
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
  // 表示設定(design.md D9): カードの生年月日・没年月日の表示粒度
  const birthDateGranularity = useDisplaySettingsStore((s) => s.birthDateGranularity)
  const deathDateGranularity = useDisplaySettingsStore((s) => s.deathDateGranularity)
  const birthGranularityRef = useRef(birthDateGranularity)
  const deathGranularityRef = useRef(deathDateGranularity)
  // 表示設定(design.md D4/D8): 和暦表示モード・カードへ表示する項目の選択
  const calendarMode = useDisplaySettingsStore((s) => s.calendarMode)
  const visibleCardFields = useDisplaySettingsStore((s) => s.visibleCardFields)
  const calendarModeRef = useRef(calendarMode)
  const visibleCardFieldsRef = useRef(visibleCardFields)
  // 表示設定(design.md D9): 婚姻線への婚姻日ラベル表示
  const showMarriageDateOnLink = useDisplaySettingsStore((s) => s.showMarriageDateOnLink)
  const showMarriageDateOnLinkRef = useRef(showMarriageDateOnLink)

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
    birthGranularityRef.current = birthDateGranularity
    deathGranularityRef.current = deathDateGranularity
    calendarModeRef.current = calendarMode
    visibleCardFieldsRef.current = visibleCardFields
    showMarriageDateOnLinkRef.current = showMarriageDateOnLink
    // 表示設定の変更をカードへ即時反映する(データ自体は変わらないため、再描画のみ促す)
    chartRef.current?.updateTree({ tree_position: 'inherit', transition_time: 0 })
  }, [birthDateGranularity, deathDateGranularity, calendarMode, visibleCardFields, showMarriageDateOnLink])

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
    let hiddenCountsCache: { tree: unknown; counts: Map<string, HiddenNeighborInfo> } | null = null
    function getHiddenCounts(): Map<string, HiddenNeighborInfo> {
      // 全体表示モード(design.md D5)は仮想ルート+スタブカードにより全人物を描画するため、
      // 通常は非表示クラスタが存在しなくなる。ただし折りたたみ表示では引き続き
      // 「main_idから辿れる範囲外」が生じるため、同じロジックを両モードで使い回す
      // (全体表示モード中は実質的に空集合を返す安全網として機能する)
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
    card.setOnCardClick((e: Event, d: TreeDatum) => {
      // 非表示人数バッジのクリックは、選択状態を変えずに視点だけをその隠れた人物側へ
      // 追従させる(design.md リスク「養子縁組を持つ人物からもう一方の親族側へ戻れない」への対応)
      const revealId = (e.target as HTMLElement | null)?.closest<HTMLElement>('.tree-card-hidden-badge')
        ?.dataset.revealId
      if (revealId) {
        chart.updateMainId(findRootAncestor(documentRef.current, revealId))
        // 選択状態(selectedPersonId)は変えないため、[selectedPersonId]依存のuseEffectでは
        // updateTreeが呼ばれない。ここで明示的に再描画をトリガーする必要がある
        chart.updateTree({ tree_position: 'fit' })
        return
      }

      const personId = (d.data as unknown as FamilyChartDatum).data.personId
      // 全体表示モードの仮想ルート(design.md D5)自体はクリック対象にしない
      if (personId === FULL_VIEW_ROOT_ID) return
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
      // 全体表示モードの仮想ルート(design.md D5)自体は実在の人物ではないため、
      // 見た目上は何も描かない(位置計算のためだけにDOM上には存在させる)
      if (person.personId === FULL_VIEW_ROOT_ID) return '<div class="tree-card tree-card-virtual-root"></div>'
      // 選択状態は朱で表現する(朱=選択の一意性を保つため、他の用途に流用しない)。
      // 性別インジケーターは朱と別配色のトークンを使う(design.md D7)
      const selectedClass = person.personId === selectedIdRef.current ? ' selected' : ''
      const deceasedClass = person.deceased ? ' deceased' : ''
      // カード表示項目の選択(design.md D8)。項目ごとに「表示対象かつデータが存在する」場合のみ描く
      const fields = visibleCardFieldsRef.current
      const years = [
        fields.birthDate
          ? formatDateForDisplay(person.birthDate, birthGranularityRef.current, calendarModeRef.current)
          : undefined,
        fields.deathDate
          ? formatDateForDisplay(person.deathDate, deathGranularityRef.current, calendarModeRef.current)
          : undefined,
      ]
        .filter((y) => y !== undefined)
        .join(' – ')
      const ageLabel =
        fields.age && person.age !== undefined
          ? `(${person.deathYear !== undefined ? '没' : ''}${person.age}歳)`
          : ''
      // 故人は伝統的な系譜記法にならい「†」を付す(カードのマーカー色と対応)。
      // 名前の縦書き列の中に文字として埋め込むと、ふりがな・生没地等の追加項目で
      // 列の縦方向スペースが狭まった際に、†が意図しない別列へ折り返されて名前の
      // 前に浮いて見える不具合が起きるため、名前列とは独立した固定位置バッジとして描く
      const deceasedMarkHtml = person.deceased
        ? '<div class="tree-card-deceased-mark" title="故人">†</div>'
        : ''
      // 姓・名は別の縦書き列として描く(位牌・表札に倣う伝統的な書式。design.md D6)。
      // 表示対象かつデータが存在する方だけを対象にし、両方非表示の場合は名前欄を空にする
      // (データはあるのに未入力と誤解させないため、未入力時のフォールバック文言は出さない。design.md D8)
      const surnameText = fields.surname ? person.surname : undefined
      const givenText = fields.given ? person.given : undefined
      const nameHtml =
        surnameText && givenText
          ? `<div class="tree-card-surname">${escapeHtml(surnameText)}</div><div class="tree-card-given">${escapeHtml(givenText)}</div>`
          : surnameText
            ? `<div class="tree-card-given">${escapeHtml(surnameText)}</div>`
            : givenText
              ? `<div class="tree-card-given">${escapeHtml(givenText)}</div>`
              : ''
      const kanaText = fields.furigana ? [person.surnameKana, person.givenKana].filter(Boolean).join(' ') : ''
      const kanaHtml = kanaText ? `<div class="tree-card-kana">${escapeHtml(kanaText)}</div>` : ''
      const placesText = [fields.birthPlace ? person.birthPlace : undefined, fields.deathPlace ? person.deathPlace : undefined]
        .filter((p): p is string => !!p)
        .join(' / ')
      const placesHtml = placesText ? `<div class="tree-card-places">${escapeHtml(placesText)}</div>` : ''
      // 折りたたみ表示時、この人物の先に隠れている人数をバッジで示す(design.md D6)。
      // 全体表示モード中は表示しない
      const hidden = getHiddenCounts().get(person.personId)
      const badgeHtml =
        hidden !== undefined
          ? `<div class="tree-card-hidden-badge" data-reveal-id="${escapeHtml(hidden.revealId)}" title="非表示の人物が${hidden.count}人います。クリックすると表示します">+${hidden.count}</div>`
          : ''
      // 性別を色のみに依存せず形状(四角/丸/破線ひし形)でも判別できるようにする(design.md D7)
      const genderClass =
        person.gender === 'M' ? 'tree-card-gender-male' : person.gender === 'F' ? 'tree-card-gender-female' : 'tree-card-gender-unknown'
      const genderTitle = person.gender === 'M' ? '男' : person.gender === 'F' ? '女' : '性別不明'
      const genderHtml = fields.genderIcon
        ? `<div class="tree-card-gender ${genderClass}" title="${genderTitle}"></div>`
        : ''
      return `<div class="tree-card${selectedClass}${deceasedClass}">
        ${genderHtml}
        ${deceasedMarkHtml}
        ${badgeHtml}
        ${kanaHtml}
        <div class="tree-card-name-row">${nameHtml}</div>
        ${years ? `<div class="tree-card-years">${escapeHtml(years)}${ageLabel ? ` ${escapeHtml(ageLabel)}` : ''}</div>` : ''}
        ${placesHtml}
      </div>`
    })

    // 系線の意味づけ: 養子は破線、婚姻線は二重線。updateTreeのたびに再適用が必要。
    // 婚姻線ラベル(design.md D9)は`.spouse-link`クラスの付与に依存するため、markLinkStylesの後に実行する
    chart.setAfterUpdate(() => {
      markLinkStyles(container, buildPedigreeByEdge(documentRef.current))
      renderMarriageLinkLabels(container, documentRef.current, {
        show: showMarriageDateOnLinkRef.current,
        calendarMode: calendarModeRef.current,
      })
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
    // 全体表示モード中にツリーを編集した場合も、通常データへ差し戻さず
    // 全体表示用データのまま更新する(showAllRef.currentで現在のモードを判定)
    const data = showAllRef.current ? toFullViewFamilyChartData(document) : toFamilyChartData(document)
    chart.updateData(data as unknown as never)
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
    if (showAll) {
      // 実親・養親の両方を持つ人物のような複数所属も、仮想ルート配下の各家系の根から
      // すべて辿れるよう、全体表示専用データ(仮想ルート+非主たる家族向けスタブカード)に
      // 差し替える(design.md D5)。以降はクリックしてもこの視点(main_id)を動かさない
      chart.updateData(toFullViewFamilyChartData(documentRef.current) as unknown as never)
      chart.updateMainId(FULL_VIEW_ROOT_ID)
    } else {
      // 通常データへ戻す。選択中の人物がいればその祖先へ即座に再追従させる。
      // これを省略すると次にカードをクリックするまで表示が変化せず、
      // 「折りたたみ表示に戻す」を押しても何も起きていないように見えてしまう
      chart.updateData(toFamilyChartData(documentRef.current) as unknown as never)
      if (selectedIdRef.current) {
        chart.updateMainId(findRootAncestor(documentRef.current, selectedIdRef.current))
      }
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
      style={{
        ['--tree-card-w' as string]: `${CARD_WIDTH}px`,
        ['--tree-card-h' as string]: `${CARD_HEIGHT}px`,
      }}
    >
      <div ref={containerRef} className="f3 tree-canvas-root" />
      <div className="tree-corner-panel">
        <button
          type="button"
          className="tree-show-all-toggle"
          aria-pressed={showAll}
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? '折りたたみ表示に戻す' : '全体表示モード'}
        </button>
        <div className="tree-legend">
          <div className="tree-legend-item">
            <span className="tree-legend-swatch" />
            <span>実子</span>
          </div>
          <div className="tree-legend-item">
            <span className="tree-legend-swatch adopted" />
            <span>養子・継子・里子・不明</span>
          </div>
          <div className="tree-legend-item">
            <span className="tree-legend-gender-swatch tree-card-gender-male" />
            <span>男</span>
          </div>
          <div className="tree-legend-item">
            <span className="tree-legend-gender-swatch tree-card-gender-female" />
            <span>女</span>
          </div>
          <div className="tree-legend-item">
            <span className="tree-legend-gender-swatch tree-card-gender-unknown" />
            <span>不明</span>
          </div>
          <div className="tree-legend-item">
            <span className="tree-legend-dot" />
            <span>故人(†)</span>
          </div>
          <p className="tree-legend-hint">カードを選ぶと編集できます</p>
        </div>
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

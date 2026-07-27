import f3, { type TreeDatum } from 'family-chart'
import 'family-chart/styles/family-chart.css'
import { useEffect, useRef, useState } from 'react'
import { useTreeStore } from '../store/tree-store'
import { AddPersonControl } from '../components/AddPersonControl'
import { UnconnectedTray } from '../components/UnconnectedTray'
import type { Pedigree } from '../domain/types'
import { CARD_SIZE } from '../layout/coordinates'
import { useDisplaySettingsStore } from '../settings/display-settings-store'
import { formatDateForDisplay } from '../settings/display-settings'
import { derivePersonCardView, personCardInnerHtml } from './person-card'
import { PedigreeCanvas } from './PedigreeCanvas'
import {
  buildPedigreeByEdge,
  compareChildrenByBirthThenName,
  computeHiddenCounts,
  computeOffChartPersonIds,
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
// setCardDim(レイアウト計算用)とCSS(.tree-card の実サイズ)の両方に用いる。
// 値そのものは`src/layout/coordinates.ts`のCARD_SIZEを正本とする(7群: PedigreeCanvasの
// レイアウト計算にも同じ寸法を使う必要があり、layoutがrenderingに依存できない以上
// (src/layout/types.test.ts)、layout側に定数を置きrenderingが読む向きにする)
const CARD_WIDTH = CARD_SIZE.width
const CARD_HEIGHT = CARD_SIZE.height

/**
 * 表示モード(design.md D7)。折りたたみ表示・全体表示(家系ごと)はfamily-chartのまま、
 * つながった全体表示だけ自前レイアウタ(PedigreeCanvas)へ差し替える
 */
export type TreeViewMode = 'collapsed' | 'full' | 'connected'

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
  // 表示モード(design.md D7): 'full'(全体表示・家系ごと)はfamily-chartの折りたたみ
  // (main_idのクリック追従)を止め、本人の兄弟姉妹も含めて描画可能な最大範囲を常に表示する。
  // 'connected'(つながった全体表示)はfamily-chart自体を描画せずPedigreeCanvasへ差し替える
  // (8.3)。family-chart関連の分岐は元の真偽値と同様「mode === 'full'」で判定し続けられるよう、
  // 'connected'とその他を区別する箇所だけ新たに増やす
  const [mode, setMode] = useState<TreeViewMode>('collapsed')
  const modeRef = useRef(mode)
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
  // クリックしたカードのmain_id追従(findRootAncestor)によって視点の祖先(main_id)が
  // 切り替わったかどうか。配偶者や傍系親族などグルーピングされたカードは、選択中の
  // 人物と別の祖先を持つことが多く、その場合は木全体の絶対座標が大きく変わる。
  // 'inherit'のままだと直前のパン位置に新しい座標系の木がそのまま描かれてしまい、
  // 選択したカードが画面の下や右へ大きくずれて見える不具合が起きるため、
  // main_idが実際に変わった回だけ'fit'で視界に収め直す
  const mainIdChangedRef = useRef(false)
  // 「図に現れていない人物」の一覧(design.md D5)を求めるための視点。
  // family-chartが折りたたみ表示で描画する人物は必ずmain_idと同じ連結成分に属するため、
  // 視点1人から`computeOffChartPersonIds`で一覧を導出できる(=レンダー中に純粋な導出として
  // 計算でき、family-chart内部の描画結果をエフェクトで読み出してsetStateする必要がない)。
  // 更新はカードのクリックハンドラ(=main_idが動く唯一の利用者操作)でのみ行う。
  // トレイのチップ選択でこの視点を動かすと、選んだ人物側が「図」になって本体側が
  // 一覧へ移ってしまうため、チップ選択では動かさない
  const [viewpointId, setViewpointId] = useState<string | null>(null)

  useEffect(() => {
    selectedIdRef.current = selectedPersonId
  }, [selectedPersonId])

  useEffect(() => {
    documentRef.current = document
  }, [document])

  useEffect(() => {
    modeRef.current = mode
  }, [mode])

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
      // 婚姻線への婚姻日ラベル(design.md D9)。family-chart組み込みのAPIを使う
      // (手動でSVG path中点を計算する方式は、D3のtransition中に古い座標を読んでしまい
      // 大きなツリーで表示位置が大きくずれる不具合があったため、レイアウト計算そのものが
      // 使う座標(sp1.y等)をそのまま使うこの方式に置き換えた)。
      // showMarriageDateOnLinkがオフの場合は空文字を返し、ラベル自体を表示しない
      .setLinkSpouseText((sp1: TreeDatum, sp2: TreeDatum) => {
        if (!showMarriageDateOnLinkRef.current) return ''
        const personAId = personIdOf(sp1)
        const personBId = personIdOf(sp2)
        if (!personAId || !personBId) return ''
        const date = marriageDate(documentRef.current, personAId, personBId)
        if (!date) return ''
        // 粒度設定は新設せず常にフル精度で表示し、和暦表示モードには追従する(design.md D9)
        return formatDateForDisplay(date, 'full', calendarModeRef.current) ?? ''
      })
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
      // 全体表示モード中は視点(表示範囲)を固定するため、main_idを動かさない(design.md D5)。
      // 'connected'時はfamily-chartのコンテナ自体が非表示のためこのハンドラは事実上発火しないが、
      // 念のため'collapsed'のときだけ追従する判定にしておく
      if (nextSelected && modeRef.current === 'collapsed') {
        const previousMainId = chart.store.getMainId()
        chart.updateMainId(findRootAncestor(documentRef.current, nextSelected))
        mainIdChangedRef.current = chart.store.getMainId() !== previousMainId
        setViewpointId(nextSelected)
      } else {
        mainIdChangedRef.current = false
      }
      onSelectPersonRef.current(nextSelected)
    })
    // カードに何を描くかの導出(design.md D3, 6群)は、つながった全体表示(PedigreeCanvas)と
    // person-card.tsを共有する。選択・非表示人数バッジは表示設定によらずこの描画系だけの
    // 状態のため、導出結果(PersonCardView)には含めずHTML組み立て関数の引数として渡す
    card.setCardInnerHtmlCreator((d: TreeDatum) => {
      const person = (d.data as unknown as FamilyChartDatum).data
      // 全体表示モードの仮想ルート(design.md D5)自体は実在の人物ではないため、
      // 見た目上は何も描かない(位置計算のためだけにDOM上には存在させる)
      if (person.personId === FULL_VIEW_ROOT_ID) return '<div class="tree-card tree-card-virtual-root"></div>'
      const view = derivePersonCardView(person, {
        birthDateGranularity: birthGranularityRef.current,
        deathDateGranularity: deathGranularityRef.current,
        calendarMode: calendarModeRef.current,
        visibleCardFields: visibleCardFieldsRef.current,
      })
      // 折りたたみ表示時、この人物の先に隠れている人数をバッジで示す(design.md D6)。
      // 全体表示モード中は実質的に空集合(getHiddenCounts参照)
      const hidden = getHiddenCounts().get(person.personId)
      // 選択状態は朱で表現する(朱=選択の一意性を保つため、他の用途に流用しない)
      return personCardInnerHtml(view, {
        selected: person.personId === selectedIdRef.current,
        hiddenBadge: hidden,
      })
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
    // 全体表示モード中にツリーを編集した場合も、通常データへ差し戻さず
    // 全体表示用データのまま更新する(modeRef.currentで現在のモードを判定)。
    // 'connected'時はfamily-chartのコンテナが非表示のため、'collapsed'と同じ通常データで構わない
    const data = modeRef.current === 'full' ? toFullViewFamilyChartData(document) : toFamilyChartData(document)
    chart.updateData(data as unknown as never)
    // 親を追加・変更すると、選択中の人物からたどれる最上位祖先(=視点)が変わりうる。
    // main_idはカードのクリック時にしか追従しないため、ここで追従させないと
    // 「既存の人物を親として紐づけたのに、その親が図に現れない」状態のまま残ってしまう。
    // 全体表示モード中は視点を仮想ルートに固定するため動かさない(design.md D5)
    const selectedId = selectedIdRef.current
    if (modeRef.current !== 'full' && selectedId && document.persons[selectedId]) {
      const nextMainId = findRootAncestor(document, selectedId)
      if (nextMainId !== chart.store.getMainId()) chart.updateMainId(nextMainId)
    }
    // 人物追加のたびに全体を視界に収める(競合の「レイアウトが崩れる/迷子になる」不満への対応)
    chart.updateTree({ tree_position: 'fit' })
  }, [document])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    // main_idが変わった場合のみ視界を合わせ直す(mainIdChangedRefの定義箇所参照)。
    // 変わらない場合は従来通り'inherit'でパン位置を保つ(クリックのたびに
    // ズーム・位置が動くと「図の上で家族を育てる」操作感を損なうため)
    if (mainIdChangedRef.current) {
      mainIdChangedRef.current = false
      chart.updateTree({ tree_position: 'fit' })
    } else {
      chart.updateTree({ tree_position: 'inherit', transition_time: 0 })
    }
  }, [selectedPersonId])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    if (mode === 'full') {
      // 実親・養親の両方を持つ人物のような複数所属も、仮想ルート配下の各家系の根から
      // すべて辿れるよう、全体表示専用データ(仮想ルート+非主たる家族向けスタブカード)に
      // 差し替える(design.md D5)。以降はクリックしてもこの視点(main_id)を動かさない
      chart.updateData(toFullViewFamilyChartData(documentRef.current) as unknown as never)
      chart.updateMainId(FULL_VIEW_ROOT_ID)
    } else {
      // 通常データへ戻す('collapsed'/'connected'共通)。選択中の人物がいればその祖先へ
      // 即座に再追従させる。これを省略すると次にカードをクリックするまで表示が変化せず、
      // 「折りたたみ表示に戻す」を押しても何も起きていないように見えてしまう。
      // 'connected'時はfamily-chart自体が非表示のため、この更新は見た目に影響しない
      chart.updateData(toFamilyChartData(documentRef.current) as unknown as never)
      if (selectedIdRef.current) {
        chart.updateMainId(findRootAncestor(documentRef.current, selectedIdRef.current))
      }
    }
    chart.updateTree({ tree_position: 'fit' })
  }, [mode])

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

  // 全体表示('full')・つながった全体表示('connected')はいずれも全人物を描画するため
  // 一覧は常に空になる(spec tree-rendering「関係を持たない人物も表示される」、design.md D4)。
  // 折りたたみ表示では、視点(未クリックならデータ先頭=family-chartの既定main_id)と
  // 同じ連結成分に属さない人物が一覧の対象になる
  const offChartIds =
    mode === 'collapsed'
      ? computeOffChartPersonIds(document, viewpointId ?? Object.keys(document.persons)[0] ?? '')
      : []

  // "f3" はfamily-chart本体のCSS(family-chart.css)が前提とするスコープクラス。
  // 凡例・ズームコントロールはfamily-chartが管理するDOM(containerRef配下)の外、兄弟要素として置く。
  // それらは図の領域(.tree-canvas-stage)に対して絶対配置し、図に現れていない人物の一覧は
  // 重なりを避けるため図の下に独立した帯として積む(design.md D6)
  return (
    <div
      className="tree-canvas-wrapper"
      style={{
        ['--tree-card-w' as string]: `${CARD_WIDTH}px`,
        ['--tree-card-h' as string]: `${CARD_HEIGHT}px`,
      }}
    >
      <div className="tree-canvas-stage">
      {/*
        family-chartのDOM(d3が内部で保持するノード参照)は一度作ったら破棄しない。
        'connected'選択時にこのdivごとReactツリーから外すと、'collapsed'/'full'へ戻した際に
        d3が古い(切り離された)DOMノードを参照し続けて再描画できなくなるため、
        見た目とヒットテストだけを止める(8.3)。

        hidden属性だけでは隠れない。family-chart.cssが`.f3`に`display: flex`を与えており、
        hidden属性のUAスタイル(display: none)はそれに打ち消されるため、隠したはずの
        キャンバスが残ったままPedigreeCanvasがその下(画面外)へ押し出される。
        どのスタイルシートよりも強いインラインstyleで確実に止める(hidden属性は支援技術向けに残す)
      */}
      <div
        ref={containerRef}
        className="f3 tree-canvas-root"
        hidden={mode === 'connected'}
        style={mode === 'connected' ? { display: 'none' } : undefined}
      />
      {mode === 'connected' ? (
        <PedigreeCanvas selectedPersonId={selectedPersonId} onSelectPerson={onSelectPerson} />
      ) : null}
      <div className="tree-corner-panel">
        {/* 選択中の人物がなくても押せる必要があるため、人物編集パネルではなく
            キャンバス側に置く(spec tree-editor「関係を指定しない人物の追加」) */}
        <AddPersonControl onAdded={(personId) => onSelectPerson(personId)} />
        {/* 表示モードの3値切り替え(design.md D7)。現在の表示はaria-pressedと
            (既存の).tree-show-all-toggle[aria-pressed='true']の配色で判別できる */}
        <div className="tree-view-mode-toggle" role="group" aria-label="表示モード">
          <button
            type="button"
            className="tree-show-all-toggle"
            aria-pressed={mode === 'collapsed'}
            onClick={() => setMode('collapsed')}
          >
            折りたたみ表示
          </button>
          <button
            type="button"
            className="tree-show-all-toggle"
            aria-pressed={mode === 'full'}
            onClick={() => setMode('full')}
          >
            全体表示(家系ごと)
          </button>
          <button
            type="button"
            className="tree-show-all-toggle"
            aria-pressed={mode === 'connected'}
            onClick={() => setMode('connected')}
          >
            つながった全体表示
          </button>
        </div>
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
      {/* family-chart用のズーム操作。'connected'時はPedigreeCanvasが自前のパン・ズームを持つため隠す */}
      {mode !== 'connected' ? (
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
      ) : null}
      </div>
      <UnconnectedTray
        personIds={offChartIds}
        selectedPersonId={selectedPersonId}
        onSelectPerson={(id) => onSelectPerson(id)}
      />
    </div>
  )
}

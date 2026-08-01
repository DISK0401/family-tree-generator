import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { Pedigree, PersonId } from '../domain/types'
import { layoutPedigree } from '../layout'
import type { PedigreeLayout } from '../layout/types'
import { useTreeStore } from '../store/tree-store'
import { useDisplaySettingsStore } from '../settings/display-settings-store'
import { ZoomControls } from '../components/ZoomControls'
import {
  derivePersonCardView,
  personCardInnerHtml,
  personToCardInput,
} from './person-card'
import './person-card.css'
import './PedigreeCanvas.css'

export interface PedigreeCanvasProps {
  selectedPersonId: string | null
  onSelectPerson: (personId: string | null) => void
}

/** viewBoxの周囲に確保する余白。カードが画面端で切れて見えないようにする */
const PADDING = 64

/** viewBox(カメラ)。SVGのwidth/height単位そのままの値で持つ */
interface Camera {
  x: number
  y: number
  width: number
  height: number
}

const MIN_SCALE = 0.25
const MAX_SCALE = 3

/**
 * 画面左に浮くコントロール群(人物を追加・表示モード・凡例)のための予約幅(px)。
 * 初期フィットがこの帯の下までカードを敷くと図の左端が隠れて見えるため(監査後の
 * デザイン検証での指摘)、フィット時だけ左にこの幅を空ける。パン操作では自由に潜り込める。
 * 640px以下ではコントロールが下部へ回り込む配置になるため予約しない
 */
const CONTROLS_INSET_LEFT_PX = 232

/**
 * 640px以下での最小フィット倍率(px / viewBox単位)。人数の多い図で「全景は収まるが
 * 文字が全く読めない」初期表示になるより可読性を優先し、これ以上は縮めずに
 * 選択中の人物(いなければ図の中央)を中心へ切り出す
 */
const MIN_FIT_SCALE_MOBILE = 0.5

function isNarrowViewport(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(max-width: 640px)')?.matches ?? false)
  )
}

/**
 * 図全体が収まるviewBoxを求める。svgの実寸が取れる場合(マウント後)は、
 * コントロール帯の回避(広い画面)と最小フィット倍率(狭い画面)を適用する。
 * 実寸が取れない場合(初期state・テスト環境)は素朴な全景フィットに落ちる
 */
function computeFitCamera(
  layout: PedigreeLayout,
  svg: SVGSVGElement | null,
  focus?: { x: number; y: number },
): Camera {
  const base: Camera = {
    x: -PADDING,
    y: -PADDING,
    width: Math.max(layout.width, 1) + PADDING * 2,
    height: Math.max(layout.height, 1) + PADDING * 2,
  }
  const rect = svg?.getBoundingClientRect()
  if (!rect || rect.width === 0 || rect.height === 0) return base

  if (!isNarrowViewport()) {
    // コントロール帯の分だけ実描画領域が狭いものとしてフィットし、図の左端を帯の右へ寄せる。
    // 帯が画面の大半を占めるような極端に狭いウィンドウでは補正しない(ゼロ除算・負幅の防止)
    if (rect.width > CONTROLS_INSET_LEFT_PX * 2) {
      const width =
        (base.width * rect.width) / (rect.width - CONTROLS_INSET_LEFT_PX)
      return {
        ...base,
        width,
        x: base.x - CONTROLS_INSET_LEFT_PX * (width / rect.width),
      }
    }
    return base
  }

  // 640px以下: フィット倍率が下限を割る場合のみ、下限倍率で焦点を中心に切り出す。
  // preserveAspectRatio(meet)と同じ「小さい方の倍率」で判定する
  const scale = Math.min(rect.width / base.width, rect.height / base.height)
  if (scale >= MIN_FIT_SCALE_MOBILE) return base
  const width = rect.width / MIN_FIT_SCALE_MOBILE
  const height = rect.height / MIN_FIT_SCALE_MOBILE
  const center = focus ?? {
    x: base.x + base.width / 2,
    y: base.y + base.height / 2,
  }
  return {
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height,
  }
}

/** 家族(結合点)から子への系線が、実子以外(養子・継子・里子・不明)かどうか */
function isNonBiological(pedigree: Pedigree): boolean {
  return pedigree !== 'biological'
}

/** SVGの`<path>`のd属性。座標列を直線でつないだ折れ線として描く(design.md D2-3の「エルボー」経路) */
function pathD(points: ReadonlyArray<{ x: number; y: number }>): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
}

/**
 * つながった全体表示(design.md D1〜D7, spec「つながった全体表示」)。
 *
 * `layoutPedigree`(src/layout)が返す座標付きの図を、SVG(系線)+`foreignObject`(カード)で
 * 描画する。レイアウト計算そのものは描画ライブラリに依存しない純粋関数であり、このコンポーネントは
 * その結果を読んで画面へ落とすだけの薄い層とする(design.md D2)。
 *
 * family-chartの折りたたみ表示とは描画の仕組みが全く別(SVG+Reactの手組み)だが、カードの
 * 見た目は6群の`person-card.ts`を共有することで一致させる(design.md D3)。
 */
export function PedigreeCanvas({
  selectedPersonId,
  onSelectPerson,
}: PedigreeCanvasProps) {
  const document = useTreeStore((s) => s.document)
  const birthDateGranularity = useDisplaySettingsStore(
    (s) => s.birthDateGranularity,
  )
  const deathDateGranularity = useDisplaySettingsStore(
    (s) => s.deathDateGranularity,
  )
  const calendarMode = useDisplaySettingsStore((s) => s.calendarMode)
  const visibleCardFields = useDisplaySettingsStore((s) => s.visibleCardFields)

  const layout = useMemo(() => layoutPedigree(document), [document])

  // viewBoxは選択状態(selectedPersonId)に一切依存させない(spec「カードの選択」: 選択操作で
  // 表示範囲が変化してはならない)。パン・ズーム操作(ドラッグ・ホイール・ボタン)でのみ動かす。
  // 初期stateはsvg実寸が無いため素朴な全景フィット。実寸を反映したフィット
  // (コントロール帯の回避・最小倍率)は下のuseLayoutEffectが担う
  const [camera, setCamera] = useState<Camera>(() =>
    computeFitCamera(layout, null),
  )

  const svgRef = useRef<SVGSVGElement>(null)

  // 選択中の人物カードの中心。モバイル最小倍率での切り出しの焦点にのみ使う。
  // 選択の変化そのものでは再フィットしない(上記spec)ため依存配列には入れず、
  // フィットを実行する瞬間(エフェクト・ズームボタン)にだけ評価する関数として持つ
  // (レンダー中にrefへ書き込む方式はreact-hooks/refsが禁じるため関数化した)
  const currentFocusPoint = () => {
    if (!selectedPersonId) return undefined
    const pos = layout.persons.find((p) => p.personId === selectedPersonId)
    if (!pos) return undefined
    return {
      x: pos.x + layout.cardSize.width / 2,
      y: pos.y + layout.cardSize.height / 2,
    }
  }

  // 図の寸法が変わった(=人物・家族の増減があった)ときだけフィットし直す。
  // svgの実寸を反映するため、描画後・ペイント前のuseLayoutEffectで行う(チラつかない)。
  // マウント直後の初回実行が「実寸込みの初期フィット」を兼ねる
  useLayoutEffect(() => {
    setCamera(computeFitCamera(layout, svgRef.current, currentFocusPoint()))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 寸法の変化のみで再フィットする(選択・内容編集では動かさない)
  }, [layout.width, layout.height])
  /**
   * ドラッグ中の状態。pointerup時にnullへ戻す。
   * カードの上から始めたドラッグでも図を動かす(既存のfamily-chartのキャンバスはd3.zoomが
   * SVG全体を掴むため、カードの上からでもパンできる。task 7.4「操作感を揃える」)。
   * そのため「押した場所のカード」を覚えておき、動かさずに離したときだけ選択操作にする。
   * 選択を`click`ではなく`pointerup`で判定するのは、`setPointerCapture`でイベントをSVGへ
   * 寄せている以上、カード上での`click`が期待どおりに発火するとは限らないため
   */
  const dragRef = useRef<{
    pointerId: number
    startClientX: number
    startClientY: number
    camera: Camera
    cardPersonId: PersonId | null
    moved: boolean
  } | null>(null)

  /** クリックとドラッグを分ける移動量(px)。手ぶれで選択が効かなくならない程度に小さく取る */
  const DRAG_THRESHOLD = 3

  /**
   * パン中のsetCameraを1フレーム1回に間引くためのrAFスロットル(監査 中5)。
   * pointermoveはフレームレートを超える頻度で発火し得るため、そのままsetCameraすると
   * 図が大きいときに再レンダリングが積み上がってパンがもたつく。
   * requestAnimationFrameが無い環境(テスト等)では即時反映にフォールバックする
   */
  const pendingCameraRef = useRef<Camera | null>(null)
  const rafIdRef = useRef<number | null>(null)
  function scheduleCamera(next: Camera) {
    if (typeof requestAnimationFrame !== 'function') {
      setCamera(next)
      return
    }
    pendingCameraRef.current = next
    if (rafIdRef.current !== null) return
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null
      if (pendingCameraRef.current) setCamera(pendingCameraRef.current)
      pendingCameraRef.current = null
    })
  }
  useEffect(() => {
    return () => {
      if (
        rafIdRef.current !== null &&
        typeof cancelAnimationFrame === 'function'
      ) {
        cancelAnimationFrame(rafIdRef.current)
      }
    }
  }, [])

  function clientToSvgScale(): { x: number; y: number } {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 1, y: 1 }
    return { x: camera.width / rect.width, y: camera.height / rect.height }
  }

  function handlePointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    const card = (e.target as Element).closest<SVGForeignObjectElement>(
      '.pedigree-card',
    )
    dragRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      camera,
      cardPersonId: card?.dataset.personId ?? null,
      moved: false,
    }
    // jsdom(テスト環境)はSVG要素にPointer Capture APIを実装していない。捕捉はポインタが
    // 要素外へ出たときに追従を続けるための最適化であり、無くても動作自体は成立する
    svgRef.current?.setPointerCapture?.(e.pointerId)
  }

  function handlePointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    const dx = e.clientX - drag.startClientX
    const dy = e.clientY - drag.startClientY
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)
      drag.moved = true
    if (!drag.moved) return
    const scale = clientToSvgScale()
    scheduleCamera({
      ...drag.camera,
      x: drag.camera.x - dx * scale.x,
      y: drag.camera.y - dy * scale.y,
    })
  }

  function handlePointerUp(e: ReactPointerEvent<SVGSVGElement>) {
    const drag = dragRef.current
    if (drag?.pointerId !== e.pointerId) return
    svgRef.current?.releasePointerCapture?.(e.pointerId)
    dragRef.current = null
    if (drag.moved || drag.cardPersonId === null) return
    onSelectPerson(
      drag.cardPersonId === selectedPersonId ? null : drag.cardPersonId,
    )
  }

  /** pointercancel(OSのジェスチャ奪取等)はタップの完了ではないため、選択を発火しない(監査 低3) */
  function handlePointerCancel(e: ReactPointerEvent<SVGSVGElement>) {
    const drag = dragRef.current
    if (drag?.pointerId !== e.pointerId) return
    svgRef.current?.releasePointerCapture?.(e.pointerId)
    dragRef.current = null
  }

  /** カーソル位置を中心に据えたままscaleFactor倍する(ホイール・+/-ボタン共通) */
  function zoomAround(clientX: number, clientY: number, scaleFactor: number) {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    setCamera((prev) => {
      const nextWidth = prev.width * scaleFactor
      const nextHeight = prev.height * scaleFactor
      // 全景フィット時の幅を基準に拡大率を求め、極端な拡大/縮小を防ぐ
      const baseWidth = Math.max(layout.width, 1) + PADDING * 2
      const nextScale = baseWidth / nextWidth
      if (nextScale < MIN_SCALE || nextScale > MAX_SCALE) return prev
      const ratioX = rect.width > 0 ? (clientX - rect.left) / rect.width : 0.5
      const ratioY = rect.height > 0 ? (clientY - rect.top) / rect.height : 0.5
      return {
        x: prev.x + (prev.width - nextWidth) * ratioX,
        y: prev.y + (prev.height - nextHeight) * ratioY,
        width: nextWidth,
        height: nextHeight,
      }
    })
  }

  // ホイールによるズームはReactの`onWheel`では実装できない。Reactはrootの`wheel`リスナを
  // passiveとして登録するため、そこでの`preventDefault()`は効かず、ズームと同時にページが
  // スクロールしてしまう。要素へ直接`{ passive: false }`で登録する
  const zoomAroundRef = useRef(zoomAround)
  useEffect(() => {
    zoomAroundRef.current = zoomAround
  })
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      zoomAroundRef.current(e.clientX, e.clientY, e.deltaY > 0 ? 1.1 : 1 / 1.1)
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [])

  /** ボタンによるズーム。画面中央を基準に、zoomAroundと同じ意味のscaleFactorをそのまま渡す
   * (scaleFactor<1で拡大、>1で縮小。viewBoxの幅を直接掛けるため、拡大縮小の向きを
   * ここで反転させない。以前は反転させたうえでzoomAroundにも渡し二重反転していたバグがあった) */
  function zoomButton(scaleFactor: number) {
    const rect = svgRef.current?.getBoundingClientRect()
    const cx = rect ? rect.left + rect.width / 2 : 0
    const cy = rect ? rect.top + rect.height / 2 : 0
    zoomAround(cx, cy, scaleFactor)
  }

  /*
   * 図の中身(系線群+カード群)はカメラ(viewBox)に依存しないため、useMemoで固定し
   * パン・ズーム中はviewBox属性の更新だけで済ませる(監査 中5)。これが無いと
   * pointermoveのたびに全カードのHTML組み立て(personCardInnerHtml)まで再実行され、
   * 人数の多い図でパンが目に見えて重くなる
   */
  const linksContent = useMemo(
    () => (
      <g className="pedigree-links">
        {layout.links.map((link) =>
          link.kind === 'marriage' ? (
            <path
              key={`marriage-${link.familyId}`}
              className="pedigree-link spouse-link"
              d={pathD(link.points)}
            />
          ) : (
            <path
              key={`parent-child-${link.familyId}-${link.childId}`}
              className={`pedigree-link${isNonBiological(link.pedigree) ? ' adopted-link' : ''}`}
              d={pathD(link.points)}
            />
          ),
        )}
      </g>
    ),
    [layout],
  )

  const cardsContent = useMemo(
    () => (
      <g className="pedigree-cards">
        {layout.persons.map((position) => {
          const person = document.persons[position.personId]
          if (!person) return null
          const view = derivePersonCardView(personToCardInput(person), {
            birthDateGranularity,
            deathDateGranularity,
            calendarMode,
            visibleCardFields,
          })
          // personCardInnerHtmlの戻り値は氏名等の利用者入力をescapeHtml済みのHTML文字列のため、
          // dangerouslySetInnerHTMLへそのまま渡してよい(person-card.ts参照)。
          // 折りたたみ表示と同じマークアップ・クラス名(.tree-card系)を使うことで、
          // カードの見た目をCSSごと共有する(design.md D3)
          const html = personCardInnerHtml(view, {
            selected: position.personId === selectedPersonId,
          })
          return (
            <foreignObject
              key={position.personId}
              className="pedigree-card"
              x={position.x}
              y={position.y}
              width={layout.cardSize.width}
              height={layout.cardSize.height}
              data-person-id={position.personId}
            >
              {/* ReactはforeignObjectの子をHTML名前空間で生成するため、xmlns属性は不要 */}
              <div dangerouslySetInnerHTML={{ __html: html }} />
            </foreignObject>
          )
        })}
      </g>
    ),
    [
      layout,
      document,
      selectedPersonId,
      birthDateGranularity,
      deathDateGranularity,
      calendarMode,
      visibleCardFields,
    ],
  )

  return (
    // カードの実寸はCSSカスタムプロパティで渡す(FamilyTreeCanvasと同じ方式)。
    // `.tree-card`のCSS側フォールバック値に頼ると、レイアウタの`cardSize`とカードの実寸が
    // 黙って食い違ってもどこにも現れず、カードだけが系線の位置とずれる
    <div
      className="pedigree-canvas-root"
      style={{
        ['--tree-card-w' as string]: `${layout.cardSize.width}px`,
        ['--tree-card-h' as string]: `${layout.cardSize.height}px`,
      }}
    >
      <svg
        ref={svgRef}
        className="pedigree-canvas-svg"
        viewBox={`${camera.x} ${camera.y} ${camera.width} ${camera.height}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        role="group"
        aria-label="つながった全体表示"
      >
        {linksContent}
        {cardsContent}
      </svg>
      {/* scaleFactorが小さいほどviewBoxが縮み、内容は拡大して見える(zoomAround参照) */}
      <ZoomControls
        onZoomIn={() => zoomButton(1 / 1.3)}
        onZoomOut={() => zoomButton(1.3)}
        onFit={() =>
          setCamera(
            computeFitCamera(layout, svgRef.current, currentFocusPoint()),
          )
        }
      />
    </div>
  )
}

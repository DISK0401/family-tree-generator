import * as d3 from 'd3'
import { normalizeWheelDelta } from './wheel-gesture'

interface NodeWithZoomObj {
  __zoomObj?: d3.ZoomBehavior<HTMLElement, unknown>
}

/**
 * family-chartが内部で使うd3-zoomインスタンス(`__zoomObj`。family-chartが
 * DOM要素へ直接生やす非公開プロパティで、公開APIには無い)を取得する。
 * `chart.svg`自身、無ければ`chart.svg.parentNode`(`family-chart`の`setupZoom`が
 * 実際に`.call(zoom)`する要素)の順に探す(`family-chart`内部の`getZoomListener`と
 * 同じ探索順)。取得できない場合(将来のバージョン更新で実装が変わった等)はnullを返し、
 * 呼び出し側は独自のwheel処理を諦めてfamily-chartの既定動作に委ねる
 * (fix-trackpad-canvas-pan-zoom design.md D3のリスク対応)
 */
export function getZoomBehavior(
  svg: SVGElement,
): d3.ZoomBehavior<HTMLElement, unknown> | null {
  const zoomObjOf = (node: Node | null) =>
    (node as unknown as NodeWithZoomObj | null)?.__zoomObj ?? null
  return zoomObjOf(svg) ?? zoomObjOf(svg.parentNode)
}

/**
 * トラックパッドの2本指パン・素のホイール回転(`ctrlKey`無し)をfamily-chartのキャンバス
 * (折りたたみ表示・全体表示(家系ごと))でもパンとして扱う。family-chartの`d3.zoom()`は
 * 既定では`wheel`を`ctrlKey`の有無に関わらず常時ズーム扱いするため、`.filter()`で
 * 「`wheel`かつ`ctrlKey`無し」をd3-zoom自身の処理対象から除外したうえで、自前のリスナーで
 * パンする。`ctrlKey`付き(ピンチ・⌘/Ctrl+ホイール)はfilterを素通りし、d3-zoom自身の
 * 既定処理(カーソル位置基準・deltaY比例のスケーリングを標準で備える)にズームを委ねる
 * (fix-trackpad-canvas-pan-zoom design.md D3)。戻り値は後始末用のクリーンアップ関数
 */
export function setupWheelPan(svg: SVGElement): () => void {
  const zoomObj = getZoomBehavior(svg)
  if (!zoomObj) return () => {}
  // d3-zoom自身の`wheel`購読先と同じ要素(`family-chart`の`setupZoom`が`.call(zoom)`する
  // `#f3Canvas`)へ揃える。ここに`__zoom`(現在のtransform)も保持されている
  const zoomTarget = (svg.parentNode ?? svg) as HTMLElement

  const defaultFilter = zoomObj.filter()
  zoomObj.filter(function (this: HTMLElement, event: Event, datum: unknown) {
    if (event.type === 'wheel' && !(event as WheelEvent).ctrlKey) return false
    return defaultFilter.call(this, event, datum)
  })

  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey) return // ズームはd3-zoom自身のwheelリスナー(同じ要素)に任せる
    e.preventDefault()
    const dx = normalizeWheelDelta(e.deltaX, e.deltaMode)
    const dy = normalizeWheelDelta(e.deltaY, e.deltaMode)
    // transformは「コンテンツ側」を直接動かす方式(PedigreeCanvasの「窓」側を動かす
    // viewBoxモデルとは符号が逆になる)。スクロールの一般的な規約(下スクロール=
    // コンテンツが上へ)に合わせるため、deltaX/deltaYの符号を反転する。d3-zoomの
    // translateByは現在のスケールkを乗じた量を動かす(Transform.translate参照)ため、
    // ドラッグパンと同じ「画面上でカーソルの移動量だけ動く」感覚に揃えるべく
    // 事前にkで割っておく
    const k = d3.zoomTransform(zoomTarget).k
    zoomObj.translateBy(d3.select(zoomTarget), -dx / k, -dy / k)
  }
  zoomTarget.addEventListener('wheel', onWheel, { passive: false })
  return () => zoomTarget.removeEventListener('wheel', onWheel)
}

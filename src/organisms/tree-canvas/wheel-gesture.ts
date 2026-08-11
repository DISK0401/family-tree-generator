/**
 * wheelイベントの1ティックあたりの移動量をおおよそピクセル相当へ正規化する。
 * トラックパッドは`deltaMode`が`DOM_DELTA_PIXEL`(0)で細かい値だが、一部のマウス・
 * ブラウザでは`DOM_DELTA_LINE`(1)や`DOM_DELTA_PAGE`(2)の粗い単位で来るため揃える
 * (d3-zoomの`wheelDelta`と同じ考え方。fix-trackpad-canvas-pan-zoom design.md D2)。
 * `PedigreeCanvas`(自前カメラ)・`FamilyTreeCanvas`(family-chart)の両方から使う
 */
export function normalizeWheelDelta(value: number, deltaMode: number): number {
  if (deltaMode === 1) return value * 16
  if (deltaMode === 2) {
    return value * (typeof window !== 'undefined' ? window.innerHeight : 800)
  }
  return value
}

/**
 * ホイール(Ctrl/⌘+ホイール・トラックパッドのピンチ)1ティックあたりの拡縮率。
 * `deltaY`の大きさに連続的に比例させ、操作の速さが体感に反映されるようにする
 * (固定10%刻みだったものの解消。design.md D2)。1回あたりの変化量はクランプし、
 * 単発で極端に大きい`deltaY`が来ても破綻しないようにする。`PedigreeCanvas`のみが使う
 * (`FamilyTreeCanvas`はd3-zoom自身のスケーリングをそのまま使うため対象外)
 */
export function wheelZoomFactor(normalizedDeltaY: number): number {
  const SENSITIVITY = 0.008
  const raw = Math.exp(normalizedDeltaY * SENSITIVITY)
  return Math.min(1.5, Math.max(1 / 1.5, raw))
}

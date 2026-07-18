import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'

/*
 * jsdomにはDOMMatrix/WebKitCSSMatrixが実装されていない。
 * family-chart(D3)のtransitionがCSS transformの補間でDOMMatrixを参照するため
 * (d3-interpolate/src/transform/parse.js)、恒等行列を返す最小限のスタブを与える。
 * これが無いと、人物ありでFamilyTreeCanvasを描画するテストが
 * 未処理例外(WebKitCSSMatrix is not defined)でvitestをexit 1にしてしまう。
 */
class DOMMatrixStub {
  a = 1
  b = 0
  c = 0
  d = 1
  e = 0
  f = 0
  isIdentity = true
  constructor(_init?: string) {}
}

if (typeof globalThis.DOMMatrix !== 'function') {
  // @ts-expect-error 最小限のスタブなのでDOM標準の型とは一致しない
  globalThis.DOMMatrix = DOMMatrixStub
}

import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'

/*
 * jsdomにはDOMMatrix/WebKitCSSMatrixが実装されていない。
 * family-chart(D3)のtransitionがCSS transformの補間でDOMMatrixを参照するため
 * (d3-interpolate/src/transform/parse.js)、恒等行列を返す最小限のスタブを与える。
 * これが無いと、人物ありでFamilyTreeCanvasを描画するテストが
 * 未処理例外(WebKitCSSMatrix is not defined)でvitestをexit 1にしてしまう。
 */
// 引数(CSS transform文字列)は無視して常に恒等行列として振る舞う
class DOMMatrixStub {
  a = 1
  b = 0
  c = 0
  d = 1
  e = 0
  f = 0
  isIdentity = true
}

if (typeof globalThis.DOMMatrix !== 'function') {
  // @ts-expect-error 最小限のスタブなのでDOM標準の型とは一致しない
  globalThis.DOMMatrix = DOMMatrixStub
}

/*
 * jsdom(本プロジェクトの29.1.1時点)のHTMLDialogElementは`open`プロパティのみで、
 * show()/showModal()/close()が未実装。ConfirmDialog(ネイティブ<dialog>ベース)の
 * テストのため、最小限のポリフィルを与える:
 * - open属性の付与・除去
 * - close時の`close`イベント
 * - showModal中のEscキー → `cancel`イベント(preventDefaultで既定のcloseを抑止できる)
 * フォーカストラップ・inert・トップレイヤは再現しない(実ブラウザのshowModalに任せる領域)。
 */
{
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & {
    __escHandler?: (e: KeyboardEvent) => void
  }
  if (typeof proto.showModal !== 'function') {
    proto.show = function (this: HTMLDialogElement) {
      this.setAttribute('open', '')
    }
    proto.showModal = function (
      this: HTMLDialogElement & { __escHandler?: (e: KeyboardEvent) => void },
    ) {
      this.setAttribute('open', '')
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key !== 'Escape') return
        // 実ブラウザのクローズリクエストは最前面のダイアログのみが受ける。
        // ネストしたdialogで二重にcancelが飛ばないよう、最も近いdialogで止める
        e.stopPropagation()
        const cancel = new Event('cancel', { cancelable: true })
        if (this.dispatchEvent(cancel)) this.close()
      }
      this.addEventListener('keydown', onKeyDown)
      this.__escHandler = onKeyDown
    }
    proto.close = function (
      this: HTMLDialogElement & { __escHandler?: (e: KeyboardEvent) => void },
      returnValue?: string,
    ) {
      if (!this.hasAttribute('open')) return
      this.removeAttribute('open')
      if (returnValue !== undefined) this.returnValue = returnValue
      if (this.__escHandler) {
        this.removeEventListener('keydown', this.__escHandler)
        delete this.__escHandler
      }
      this.dispatchEvent(new Event('close'))
    }
  }
}

/*
 * BroadcastChannelをテスト環境ローカルな実装へ差し替える。
 *
 * jsdom自体はBroadcastChannelを持たないが、vitest(Node)のグローバルが見えるため
 * `typeof BroadcastChannel === 'undefined'`ガードを通過してNode実装が使われる。
 * NodeのBroadcastChannelは**workerスレッドを跨いで**配信されるため、並列実行中の
 * 別テストファイルの自動保存通知(use-persisted-tree)がこのファイルのAppへ届いて
 * stale化させ、テストが不規則に失敗する。配信範囲を同一環境(同一ワーカー)内に
 * 限定したローカル実装で置き換えて、ファイル間の独立性を保つ。
 * (use-persisted-tree.test.tsxはさらに自前のモックをvi.stubGlobalで重ねるため影響しない)
 */
class LocalBroadcastChannel {
  static instances = new Set<LocalBroadcastChannel>()
  readonly name: string
  onmessage: ((event: MessageEvent) => void) | null = null
  private closed = false
  constructor(name: string) {
    this.name = name
    LocalBroadcastChannel.instances.add(this)
  }
  postMessage(data: unknown): void {
    if (this.closed) return
    for (const channel of LocalBroadcastChannel.instances) {
      if (channel === this || channel.closed || channel.name !== this.name)
        continue
      channel.onmessage?.({ data } as MessageEvent)
    }
  }
  close(): void {
    this.closed = true
    LocalBroadcastChannel.instances.delete(this)
  }
}

// @ts-expect-error onmessage/postMessage/closeのみの最小実装のためDOM標準の型とは一致しない
globalThis.BroadcastChannel = LocalBroadcastChannel

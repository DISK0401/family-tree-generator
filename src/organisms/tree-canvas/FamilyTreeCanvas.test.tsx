import { fireEvent, render, screen, within } from '@testing-library/react'
import * as d3 from 'd3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTreeDocument } from '../../domain/helpers'
import type { TreeDocument } from '../../domain/types'
import { useTreeStore } from '../../store/tree-store'
import { getZoomBehavior, setupWheelPan } from './family-chart-wheel-pan'
import { FamilyTreeCanvas } from './FamilyTreeCanvas'

/**
 * 表示モードの3値化(design.md D7, tasks.md 8群)のコンポーネントテスト。
 * family-chart自体の描画詳細(内部DOM構造)には立ち入らず、モード切替による
 * 差し替え・トレイの有無・ボタンの状態(視覚的な区別の元になるaria-pressed)だけを検証する
 */

function docWithUnconnectedPerson(): TreeDocument {
  const doc = createTreeDocument()
  doc.persons['a'] = { id: 'a', name: { given: 'A' }, gender: 'unknown' }
  doc.persons['b'] = { id: 'b', name: { given: 'B' }, gender: 'unknown' } // どの家族にも属さない
  return doc
}

beforeEach(() => {
  useTreeStore.getState().replace(docWithUnconnectedPerson())
})

describe('FamilyTreeCanvas: 表示モードの3値化(8.1, 8.2)', () => {
  it('既定は折りたたみ表示で、3つのボタンがそれぞれ切り替えられる', () => {
    render(
      <FamilyTreeCanvas selectedPersonId={null} onSelectPerson={() => {}} />,
    )

    const collapsedButton = screen.getByRole('button', {
      name: '折りたたみ表示',
    })
    const fullButton = screen.getByRole('button', {
      name: '全体表示(家系ごと)',
    })
    const connectedButton = screen.getByRole('button', {
      name: 'つながった全体表示',
    })

    expect(collapsedButton).toHaveAttribute('aria-pressed', 'true')
    expect(fullButton).toHaveAttribute('aria-pressed', 'false')
    expect(connectedButton).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(fullButton)
    expect(collapsedButton).toHaveAttribute('aria-pressed', 'false')
    expect(fullButton).toHaveAttribute('aria-pressed', 'true')
    expect(connectedButton).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(connectedButton)
    expect(collapsedButton).toHaveAttribute('aria-pressed', 'false')
    expect(fullButton).toHaveAttribute('aria-pressed', 'false')
    expect(connectedButton).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(collapsedButton)
    expect(collapsedButton).toHaveAttribute('aria-pressed', 'true')
    expect(fullButton).toHaveAttribute('aria-pressed', 'false')
    expect(connectedButton).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('FamilyTreeCanvas: connectedモードでの描画系の入れ替え(8.3)', () => {
  it('つながった全体表示ではfamily-chartのキャンバスが隠れ、PedigreeCanvasが描画される', () => {
    const { container } = render(
      <FamilyTreeCanvas selectedPersonId={null} onSelectPerson={() => {}} />,
    )

    // 既定(折りたたみ表示)ではfamily-chartのコンテナが見えており、PedigreeCanvasは無い
    expect(container.querySelector('.f3.tree-canvas-root')).not.toHaveAttribute(
      'hidden',
    )
    expect(
      container.querySelector('.pedigree-canvas-root'),
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'つながった全体表示' }))

    // 切り替えるとfamily-chart側は隠れ(DOM自体は保持。FamilyTreeCanvas.tsxのコメント参照)、
    // PedigreeCanvasが現れる
    expect(container.querySelector('.f3.tree-canvas-root')).toHaveAttribute(
      'hidden',
    )
    expect(container.querySelector('.pedigree-canvas-root')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '折りたたみ表示' }))
    expect(container.querySelector('.f3.tree-canvas-root')).not.toHaveAttribute(
      'hidden',
    )
    expect(
      container.querySelector('.pedigree-canvas-root'),
    ).not.toBeInTheDocument()
  })

  it('family-chartのキャンバスが属性だけでなく実際に隠れる', () => {
    // family-chart.cssは`.f3`に`display: flex`を与えるため、hidden属性のUAスタイル
    // (display: none)は打ち消される。属性が付いていることだけを見るテストでは、
    // 「隠したはずのキャンバスが残ったままPedigreeCanvasが画面外へ押し出される」不具合を
    // 通してしまう(実機で発生した)。実際に描画されない状態かどうかで確かめる
    const { container } = render(
      <FamilyTreeCanvas selectedPersonId={null} onSelectPerson={() => {}} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'つながった全体表示' }))

    const canvas = container.querySelector('.f3.tree-canvas-root')
    expect(canvas).not.toBeNull()
    expect(canvas).not.toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: '折りたたみ表示' }))
    expect(container.querySelector('.f3.tree-canvas-root')).toBeVisible()
  })

  it('表示モードを切り替えてもTreeDocumentは変化しない', () => {
    render(
      <FamilyTreeCanvas selectedPersonId={null} onSelectPerson={() => {}} />,
    )
    const before = useTreeStore.getState().document

    fireEvent.click(screen.getByRole('button', { name: '全体表示(家系ごと)' }))
    fireEvent.click(screen.getByRole('button', { name: 'つながった全体表示' }))
    fireEvent.click(screen.getByRole('button', { name: '折りたたみ表示' }))

    expect(useTreeStore.getState().document).toBe(before)
  })
})

describe('FamilyTreeCanvas: ホイールのパン/ズーム分岐(fix-trackpad-canvas-pan-zoom)', () => {
  /**
   * d3-zoomが要素に直接持たせる現在のtransform(`__zoom`)を読む。他のFamilyTreeCanvas
   * テストと異なり、この機能(wheelでのパン/ズーム分岐)自体がfamily-chart内部のd3-zoom
   * transformを直接操作するものであるため、ここでは内部DOMを読むことが避けられない。
   * `.style.transform`(CSS文字列)ではなくこちらを読むのは、family-chartの初期fit
   * (`positionTree`)がtransition経由(実時間依存)で反映するのに対し、wheelでの
   * パン/ズーム(自前のtranslateBy呼び出し・d3-zoom自身のwheelハンドラ)はどちらも
   * `__zoom`を同期的に更新するため、実時間のtransitionを待たずに検証できるため
   */
  function getZoomState(container: HTMLElement) {
    const target = container.querySelector<HTMLElement>('#f3Canvas')
    if (!target) throw new Error('#f3Canvasが見つからない')
    return d3.zoomTransform(target)
  }

  it('ctrlKey無しのwheel(トラックパッドの2本指パンを含む)はパンし、d3-zoom自身のズームは発火しない', () => {
    const { container } = render(
      <FamilyTreeCanvas selectedPersonId={null} onSelectPerson={() => {}} />,
    )
    const svg = container.querySelector('.f3.tree-canvas-root svg.main_svg')!
    const before = getZoomState(container)

    fireEvent.wheel(svg, { deltaX: 20, deltaY: 30, ctrlKey: false })

    const after = getZoomState(container)
    // ズーム(k)は変化せず、パン(x/y)だけが動く。符号はスクロールの一般的な規約
    // (下スクロール=コンテンツが上へ)に合わせて反転している(design.md D3)
    expect(after.k).toBe(before.k)
    expect(after.x).toBe(before.x - 20)
    expect(after.y).toBe(before.y - 30)
  })

  it('ctrlKey付きのwheel(ピンチ・Ctrl/⌘+ホイール)はd3-zoom自身の既定処理でズームする', () => {
    const { container } = render(
      <FamilyTreeCanvas selectedPersonId={null} onSelectPerson={() => {}} />,
    )
    const svg = container.querySelector('.f3.tree-canvas-root svg.main_svg')!
    const before = getZoomState(container)

    // deltaY<0(指を広げる/ホイールを上へ)はズームイン
    fireEvent.wheel(svg, { deltaY: -100, ctrlKey: true })

    const after = getZoomState(container)
    expect(after.k).toBeGreaterThan(before.k)
  })

  it('+/-ボタン(manualZoom)は本changeの前後で挙動が変わらない', () => {
    render(
      <FamilyTreeCanvas selectedPersonId={null} onSelectPerson={() => {}} />,
    )
    const before = useTreeStore.getState().document
    // クリック自体がエラーにならず、ドキュメントも変化しないことを確認する
    // (family-chartのtransition完了はjsdomでは待てないため、transformの数値までは見ない)
    expect(() =>
      fireEvent.click(screen.getByRole('button', { name: '拡大' })),
    ).not.toThrow()
    expect(() =>
      fireEvent.click(screen.getByRole('button', { name: '縮小' })),
    ).not.toThrow()
    expect(useTreeStore.getState().document).toBe(before)
  })

  it('__zoomObjが取得できない要素ではエラーにならず、独自のwheel処理を諦める', () => {
    // family-chartのsetupZoomを経ていないただのsvg(__zoomObj無し)を渡すケース
    // (design.md D3のリスク対応: 将来のfamily-chartバージョン更新で実装が変わった場合)
    const bareSvg = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'svg',
    )
    document.body.appendChild(bareSvg)

    expect(getZoomBehavior(bareSvg)).toBeNull()

    let teardown: () => void = () => {}
    expect(() => {
      teardown = setupWheelPan(bareSvg)
    }).not.toThrow()
    // 独自のwheelリスナーを追加していないため、wheelイベントを送ってもエラーにならない
    expect(() =>
      fireEvent.wheel(bareSvg, { deltaX: 10, deltaY: 10, ctrlKey: false }),
    ).not.toThrow()
    expect(() => teardown()).not.toThrow()

    document.body.removeChild(bareSvg)
  })
})

describe('FamilyTreeCanvas: connectedモードでのトレイ(8.4)', () => {
  it('折りたたみ表示では図に現れていない人物の一覧が出るが、connectedでは出ない', () => {
    render(
      <FamilyTreeCanvas selectedPersonId={null} onSelectPerson={() => {}} />,
    )

    expect(screen.getByLabelText('図に現れていない人物')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'つながった全体表示' }))

    expect(
      screen.queryByLabelText('図に現れていない人物'),
    ).not.toBeInTheDocument()
  })
})

describe('FamilyTreeCanvas: キーボードでの人物選択経路(監査 高4)', () => {
  it('「人物を探す」ダイアログから候補を選ぶと選択コールバックが呼ばれ、ダイアログが閉じる', () => {
    const onSelectPerson = vi.fn()
    render(
      <FamilyTreeCanvas
        selectedPersonId={null}
        onSelectPerson={onSelectPerson}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '人物を探す' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('open')

    const input = within(dialog).getByRole('combobox')
    fireEvent.change(input, { target: { value: 'B' } })
    fireEvent.click(within(dialog).getByRole('option', { name: 'B' }))

    expect(onSelectPerson).toHaveBeenCalledWith('b')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('閉じるボタンで何も選ばずに閉じられる', () => {
    const onSelectPerson = vi.fn()
    render(
      <FamilyTreeCanvas
        selectedPersonId={null}
        onSelectPerson={onSelectPerson}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '人物を探す' }))
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }))

    expect(onSelectPerson).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { family, person, testDoc } from '../../layout/test-fixtures'
import { useTreeStore } from '../../store/tree-store'
import { PedigreeCanvas } from './PedigreeCanvas'

/** 表示中のカード(foreignObject)のy座標を、カード内のテキストから逆引きする */
function cardYOf(name: string): number {
  const el = screen.getByText(name)
  const card = el.closest('.pedigree-card')
  if (!card) throw new Error(`カードが見つからない: ${name}`)
  const y = card.getAttribute('y')
  if (y === null) throw new Error(`y座標が見つからない: ${name}`)
  return Number(y)
}

describe('PedigreeCanvas: 三世代の描画(7.1)', () => {
  beforeEach(() => {
    const doc = testDoc(
      [
        person('gf', '祖父'),
        person('gm', '祖母'),
        person('father', '父'),
        person('mother', '母'),
        person('child', '子'),
      ],
      [
        family(
          'fGrandparents',
          ['gf', 'gm'],
          [{ childId: 'father', pedigree: 'biological' }],
        ),
        family(
          'fParents',
          ['father', 'mother'],
          [{ childId: 'child', pedigree: 'biological' }],
        ),
      ],
    )
    useTreeStore.getState().replace(doc)
  })

  it('祖父母・父母・子が層ごとに上から順に描画される', () => {
    render(<PedigreeCanvas selectedPersonId={null} onSelectPerson={() => {}} />)

    const gfY = cardYOf('祖父')
    const gmY = cardYOf('祖母')
    const fatherY = cardYOf('父')
    const childY = cardYOf('子')

    expect(gfY).toBe(gmY) // 同じ世代は同じ層(y座標)
    expect(gfY).toBeLessThan(fatherY)
    expect(fatherY).toBeLessThan(childY)
  })

  it('折りたたみ表示と同じカード表現(縦書きの氏名のマークアップ)で描かれる', () => {
    const { container } = render(
      <PedigreeCanvas selectedPersonId={null} onSelectPerson={() => {}} />,
    )
    // person-card.tsが組み立てるHTML(.tree-card系)がforeignObject配下にそのまま現れること
    expect(container.querySelectorAll('.tree-card').length).toBe(5)
    expect(container.querySelector('.tree-card-given')).toBeInTheDocument()
  })
})

describe('PedigreeCanvas: 系線のクラス(7.2)', () => {
  it('養子の系線にadopted-linkクラスが付き、実子には付かない', () => {
    const doc = testDoc(
      [
        person('father', '父'),
        person('mother', '母'),
        person('bio', '実子'),
        person('adopted', '養子'),
      ],
      [
        family(
          'f1',
          ['father', 'mother'],
          [
            { childId: 'bio', pedigree: 'biological' },
            { childId: 'adopted', pedigree: 'adopted' },
          ],
        ),
      ],
    )
    useTreeStore.getState().replace(doc)
    const { container } = render(
      <PedigreeCanvas selectedPersonId={null} onSelectPerson={() => {}} />,
    )

    const adoptedLinks = container.querySelectorAll(
      'path.pedigree-link.adopted-link',
    )
    const allParentChildLinks = container.querySelectorAll(
      'path.pedigree-link:not(.spouse-link)',
    )
    expect(adoptedLinks).toHaveLength(1)
    expect(allParentChildLinks).toHaveLength(2) // 実子1本・養子1本
  })

  it('婚姻線にspouse-linkクラスが付く', () => {
    const doc = testDoc(
      [person('husband', '夫'), person('wife', '妻')],
      [family('f1', ['husband', 'wife'], [])],
    )
    useTreeStore.getState().replace(doc)
    const { container } = render(
      <PedigreeCanvas selectedPersonId={null} onSelectPerson={() => {}} />,
    )

    expect(
      container.querySelectorAll('path.pedigree-link.spouse-link'),
    ).toHaveLength(1)
  })
})

describe('PedigreeCanvas: カードの選択(7.3)', () => {
  /**
   * 選択は`click`ではなく`pointerdown`→`pointerup`で判定する(PedigreeCanvas.tsx参照)。
   * カードの上から始めたドラッグでも図をパンできるようにしたため、
   * 「押してから動かさずに離した」ことを見て初めて選択とみなす
   */
  function tapCard(element: Element, pointerId = 1): void {
    fireEvent.pointerDown(element, { pointerId, clientX: 10, clientY: 10 })
    fireEvent.pointerUp(element, { pointerId, clientX: 10, clientY: 10 })
  }

  beforeEach(() => {
    const doc = testDoc(
      [person('a', 'A'), person('b', 'B')],
      [family('f1', ['a', 'b'], [])],
    )
    useTreeStore.getState().replace(doc)
  })

  it('カードのクリックでonSelectPersonがその人物IDで呼ばれる', () => {
    const onSelectPerson = vi.fn()
    render(
      <PedigreeCanvas
        selectedPersonId={null}
        onSelectPerson={onSelectPerson}
      />,
    )

    tapCard(screen.getByText('A'))
    expect(onSelectPerson).toHaveBeenCalledWith('a')
  })

  it('選択中の人物を再度クリックすると選択解除(null)になる', () => {
    const onSelectPerson = vi.fn()
    render(
      <PedigreeCanvas selectedPersonId="a" onSelectPerson={onSelectPerson} />,
    )

    tapCard(screen.getByText('A'))
    expect(onSelectPerson).toHaveBeenCalledWith(null)
  })

  it('カードの上から始めたドラッグは選択ではなくパンになる', () => {
    const onSelectPerson = vi.fn()
    const { container } = render(
      <PedigreeCanvas
        selectedPersonId={null}
        onSelectPerson={onSelectPerson}
      />,
    )
    const card = screen.getByText('A')

    fireEvent.pointerDown(card, { pointerId: 1, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(card, { pointerId: 1, clientX: 90, clientY: 60 })
    fireEvent.pointerUp(card, { pointerId: 1, clientX: 90, clientY: 60 })

    expect(onSelectPerson).not.toHaveBeenCalled()
    expect(container.querySelector('.pedigree-canvas-svg')).toBeInTheDocument()
  })

  it('カードの選択操作によってSVGのviewBoxは変化しない', () => {
    const onSelectPerson = vi.fn()
    const { container } = render(
      <PedigreeCanvas
        selectedPersonId={null}
        onSelectPerson={onSelectPerson}
      />,
    )
    const svg = container.querySelector('.pedigree-canvas-svg')
    expect(svg).toBeInTheDocument()
    const viewBoxBefore = svg?.getAttribute('viewBox')

    tapCard(screen.getByText('A'))

    expect(svg?.getAttribute('viewBox')).toBe(viewBoxBefore)
  })

  it('pointercancel(OSのジェスチャ奪取等)では選択が発火しない(監査 低3)', () => {
    const onSelectPerson = vi.fn()
    render(
      <PedigreeCanvas
        selectedPersonId={null}
        onSelectPerson={onSelectPerson}
      />,
    )
    const card = screen.getByText('A')

    fireEvent.pointerDown(card, { pointerId: 1, clientX: 10, clientY: 10 })
    fireEvent.pointerCancel(card, { pointerId: 1 })

    expect(onSelectPerson).not.toHaveBeenCalled()
  })

  it('pointercancel後の別のタップは通常どおり選択できる(ドラッグ状態が残らない)', () => {
    const onSelectPerson = vi.fn()
    render(
      <PedigreeCanvas
        selectedPersonId={null}
        onSelectPerson={onSelectPerson}
      />,
    )
    const card = screen.getByText('A')

    fireEvent.pointerDown(card, { pointerId: 1, clientX: 10, clientY: 10 })
    fireEvent.pointerCancel(card, { pointerId: 1 })
    tapCard(card, 2)

    expect(onSelectPerson).toHaveBeenCalledWith('a')
  })
})

describe('PedigreeCanvas: パン(監査 中5: rAFスロットル・内容のメモ化の回帰)', () => {
  beforeEach(() => {
    const doc = testDoc(
      [person('a', 'A'), person('b', 'B')],
      [family('f1', ['a', 'b'], [])],
    )
    useTreeStore.getState().replace(doc)
  })

  it('ドラッグでviewBoxが更新される(スロットル後も反映される)', async () => {
    const { container } = render(
      <PedigreeCanvas selectedPersonId={null} onSelectPerson={() => {}} />,
    )
    const svg = container.querySelector('.pedigree-canvas-svg')!
    const viewBoxBefore = svg.getAttribute('viewBox')

    fireEvent.pointerDown(svg, { pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 40, clientY: 100 })

    // setCameraはrAFで間引かれるため、フレーム経過後の反映を待つ
    await waitFor(() => {
      expect(svg.getAttribute('viewBox')).not.toBe(viewBoxBefore)
    })

    // パンしてもカード(図の中身)は同じ内容のまま(メモ化により作り直されない)
    expect(container.querySelectorAll('.tree-card')).toHaveLength(2)
  })
})

/** viewBox属性("x y width height")を数値へ分解する */
function parseViewBox(svg: Element): {
  x: number
  y: number
  width: number
  height: number
} {
  const raw = svg.getAttribute('viewBox')
  if (!raw) throw new Error('viewBoxが見つからない')
  const [x, y, width, height] = raw.split(' ').map(Number)
  return { x, y, width, height }
}

describe('PedigreeCanvas: ホイールのパン/ズーム分岐(fix-trackpad-canvas-pan-zoom)', () => {
  beforeEach(() => {
    const doc = testDoc(
      [person('a', 'A'), person('b', 'B')],
      [family('f1', ['a', 'b'], [])],
    )
    useTreeStore.getState().replace(doc)
  })

  it('ctrlKey無しのwheel(トラックパッドの2本指パンを含む)はパンし、拡大縮小しない', async () => {
    const { container } = render(
      <PedigreeCanvas selectedPersonId={null} onSelectPerson={() => {}} />,
    )
    const svg = container.querySelector('.pedigree-canvas-svg')!
    const before = parseViewBox(svg)

    fireEvent.wheel(svg, { deltaX: 30, deltaY: 20, ctrlKey: false })

    await waitFor(() => {
      expect(parseViewBox(svg).x).not.toBe(before.x)
    })
    const after = parseViewBox(svg)
    expect(after.width).toBe(before.width)
    expect(after.height).toBe(before.height)
    // wheelのdeltaX/deltaYはドラッグパンとは逆に、そのままカメラへ加算される(design.md D2)
    expect(after.x).toBeGreaterThan(before.x)
    expect(after.y).toBeGreaterThan(before.y)
  })

  it('ctrlKey付きのwheel(ピンチ・Ctrl/⌘+ホイール)はズームし、パンしない', async () => {
    const { container } = render(
      <PedigreeCanvas selectedPersonId={null} onSelectPerson={() => {}} />,
    )
    const svg = container.querySelector('.pedigree-canvas-svg')!
    const before = parseViewBox(svg)

    // deltaY<0(指を広げる/ホイールを上へ)はズームイン(viewBoxが縮む)
    fireEvent.wheel(svg, { deltaY: -50, ctrlKey: true })

    await waitFor(() => {
      expect(parseViewBox(svg).width).not.toBe(before.width)
    })
    const after = parseViewBox(svg)
    expect(after.width).toBeLessThan(before.width)
    expect(after.height).toBeLessThan(before.height)
  })

  it('deltaYが大きいほど1回あたりの拡縮量が大きい(固定10%刻みの解消)', async () => {
    const { container: smallContainer } = render(
      <PedigreeCanvas selectedPersonId={null} onSelectPerson={() => {}} />,
    )
    const smallSvg = smallContainer.querySelector('.pedigree-canvas-svg')!
    const smallBefore = parseViewBox(smallSvg)
    fireEvent.wheel(smallSvg, { deltaY: 5, ctrlKey: true })
    await waitFor(() => {
      expect(parseViewBox(smallSvg).width).not.toBe(smallBefore.width)
    })
    const smallRatio = parseViewBox(smallSvg).width / smallBefore.width

    const { container: largeContainer } = render(
      <PedigreeCanvas selectedPersonId={null} onSelectPerson={() => {}} />,
    )
    const largeSvg = largeContainer.querySelector('.pedigree-canvas-svg')!
    const largeBefore = parseViewBox(largeSvg)
    fireEvent.wheel(largeSvg, { deltaY: 50, ctrlKey: true })
    await waitFor(() => {
      expect(parseViewBox(largeSvg).width).not.toBe(largeBefore.width)
    })
    const largeRatio = parseViewBox(largeSvg).width / largeBefore.width

    // どちらもdeltaY>0(縮小方向)なので比率は1より大きく、大きいdeltaYの方がより縮小が大きい
    expect(smallRatio).toBeGreaterThan(1)
    expect(largeRatio).toBeGreaterThan(smallRatio)
  })

  it('連続したctrlKey付きwheelも取りこぼさず積算される(rAFスロットル中の起点をpendingCameraにする)', async () => {
    const { container } = render(
      <PedigreeCanvas selectedPersonId={null} onSelectPerson={() => {}} />,
    )
    const svg = container.querySelector('.pedigree-canvas-svg')!
    const before = parseViewBox(svg)

    // rAFが1回も走っていないうちに2回連続でズームイン方向のwheelを送る
    fireEvent.wheel(svg, { deltaY: -50, ctrlKey: true })
    fireEvent.wheel(svg, { deltaY: -50, ctrlKey: true })

    await waitFor(() => {
      expect(parseViewBox(svg).width).not.toBe(before.width)
    })
    const afterTwoTicksWidth = parseViewBox(svg).width

    const { container: oneTickContainer } = render(
      <PedigreeCanvas selectedPersonId={null} onSelectPerson={() => {}} />,
    )
    const oneTickSvg = oneTickContainer.querySelector('.pedigree-canvas-svg')!
    const oneTickBefore = parseViewBox(oneTickSvg)
    fireEvent.wheel(oneTickSvg, { deltaY: -50, ctrlKey: true })
    await waitFor(() => {
      expect(parseViewBox(oneTickSvg).width).not.toBe(oneTickBefore.width)
    })

    // 2回分のズームは1回分より大きく縮む(2発目が取りこぼされていない)
    expect(afterTwoTicksWidth).toBeLessThan(parseViewBox(oneTickSvg).width)
  })
})

describe('PedigreeCanvas: 初期フィット(デザイン検証の指摘1・7)', () => {
  const PADDING = 64
  const CONTROLS_INSET_LEFT_PX = 232

  /** jsdomのgetBoundingClientRectは常に0を返すため、svgの実寸をモックしてフィット計算を通す */
  function mockSvgRect(width: number, height: number) {
    vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width,
      height,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
  }

  /** '(max-width: 640px)' のみ一致する狭幅ビューポートをモックする
   *  (jsdomはmatchMedia未実装のため、spyOnではなくstubGlobalで定義する) */
  function mockNarrowViewport() {
    vi.stubGlobal(
      'matchMedia',
      (query: string) =>
        ({
          matches: query === '(max-width: 640px)',
          media: query,
          onchange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList,
    )
  }

  function viewBoxOf(container: HTMLElement): {
    x: number
    y: number
    width: number
    height: number
  } {
    const svg = container.querySelector('.pedigree-canvas-svg')
    const parts = (svg?.getAttribute('viewBox') ?? '').split(' ').map(Number)
    return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] }
  }

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('広い画面では左のコントロール帯(232px)を避けて図をフィットする', () => {
    const doc = testDoc(
      [person('a', 'A'), person('b', 'B')],
      [family('f1', ['a', 'b'], [])],
    )
    useTreeStore.getState().replace(doc)
    mockSvgRect(1200, 800)

    const { container } = render(
      <PedigreeCanvas selectedPersonId={null} onSelectPerson={() => {}} />,
    )

    const vb = viewBoxOf(container)
    // 予約幅の検算: 図の左端(-PADDING)が画面上で予約幅ぶん右に置かれる。
    // (-PADDING - vb.x) をpxへ換算すると CONTROLS_INSET_LEFT_PX になるはず
    const reservedPx = (-PADDING - vb.x) * (1200 / vb.width)
    expect(reservedPx).toBeCloseTo(CONTROLS_INSET_LEFT_PX, 5)
  })

  it('640px以下では最小倍率(0.5)より縮めず、図の中央を切り出す', () => {
    // 単身者を横に並べて、全景フィットだと倍率が0.5を大きく割る幅の図を作る
    const singles = Array.from({ length: 12 }, (_, i) =>
      person(`p${i}`, `人${i}`),
    )
    useTreeStore.getState().replace(testDoc(singles, []))
    mockNarrowViewport()
    mockSvgRect(390, 700)

    const { container } = render(
      <PedigreeCanvas selectedPersonId={null} onSelectPerson={() => {}} />,
    )

    const vb = viewBoxOf(container)
    // 最小倍率でのビューポート幅: 390px / 0.5 = 780 viewBox単位
    expect(vb.width).toBeCloseTo(780, 5)
    expect(vb.height).toBeCloseTo(1400, 5)
  })

  it('640px以下の切り出しは、選択中の人物を中心に据える', () => {
    const singles = Array.from({ length: 12 }, (_, i) =>
      person(`p${i}`, `人${i}`),
    )
    useTreeStore.getState().replace(testDoc(singles, []))
    mockNarrowViewport()
    mockSvgRect(390, 700)

    const { container } = render(
      <PedigreeCanvas selectedPersonId="p9" onSelectPerson={() => {}} />,
    )

    const card = container.querySelector('.pedigree-card[data-person-id="p9"]')
    const cardX = Number(card?.getAttribute('x'))
    const cardW = Number(card?.getAttribute('width'))
    const vb = viewBoxOf(container)
    // 選択カードの中心x = viewBoxの中心x
    expect(cardX + cardW / 2).toBeCloseTo(vb.x + vb.width / 2, 5)
  })
})

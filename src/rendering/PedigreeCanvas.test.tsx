import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { family, person, testDoc } from '../layout/test-fixtures'
import { useTreeStore } from '../store/tree-store'
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
        family('fGrandparents', ['gf', 'gm'], [{ childId: 'father', pedigree: 'biological' }]),
        family('fParents', ['father', 'mother'], [{ childId: 'child', pedigree: 'biological' }]),
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
    const { container } = render(<PedigreeCanvas selectedPersonId={null} onSelectPerson={() => {}} />)
    // person-card.tsが組み立てるHTML(.tree-card系)がforeignObject配下にそのまま現れること
    expect(container.querySelectorAll('.tree-card').length).toBe(5)
    expect(container.querySelector('.tree-card-given')).toBeInTheDocument()
  })
})

describe('PedigreeCanvas: 系線のクラス(7.2)', () => {
  it('養子の系線にadopted-linkクラスが付き、実子には付かない', () => {
    const doc = testDoc(
      [person('father', '父'), person('mother', '母'), person('bio', '実子'), person('adopted', '養子')],
      [
        family('f1', ['father', 'mother'], [
          { childId: 'bio', pedigree: 'biological' },
          { childId: 'adopted', pedigree: 'adopted' },
        ]),
      ],
    )
    useTreeStore.getState().replace(doc)
    const { container } = render(<PedigreeCanvas selectedPersonId={null} onSelectPerson={() => {}} />)

    const adoptedLinks = container.querySelectorAll('path.pedigree-link.adopted-link')
    const allParentChildLinks = container.querySelectorAll('path.pedigree-link:not(.spouse-link)')
    expect(adoptedLinks).toHaveLength(1)
    expect(allParentChildLinks).toHaveLength(2) // 実子1本・養子1本
  })

  it('婚姻線にspouse-linkクラスが付く', () => {
    const doc = testDoc(
      [person('husband', '夫'), person('wife', '妻')],
      [family('f1', ['husband', 'wife'], [])],
    )
    useTreeStore.getState().replace(doc)
    const { container } = render(<PedigreeCanvas selectedPersonId={null} onSelectPerson={() => {}} />)

    expect(container.querySelectorAll('path.pedigree-link.spouse-link')).toHaveLength(1)
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
    render(<PedigreeCanvas selectedPersonId={null} onSelectPerson={onSelectPerson} />)

    tapCard(screen.getByText('A'))
    expect(onSelectPerson).toHaveBeenCalledWith('a')
  })

  it('選択中の人物を再度クリックすると選択解除(null)になる', () => {
    const onSelectPerson = vi.fn()
    render(<PedigreeCanvas selectedPersonId="a" onSelectPerson={onSelectPerson} />)

    tapCard(screen.getByText('A'))
    expect(onSelectPerson).toHaveBeenCalledWith(null)
  })

  it('カードの上から始めたドラッグは選択ではなくパンになる', () => {
    const onSelectPerson = vi.fn()
    const { container } = render(<PedigreeCanvas selectedPersonId={null} onSelectPerson={onSelectPerson} />)
    const card = screen.getByText('A')

    fireEvent.pointerDown(card, { pointerId: 1, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(card, { pointerId: 1, clientX: 90, clientY: 60 })
    fireEvent.pointerUp(card, { pointerId: 1, clientX: 90, clientY: 60 })

    expect(onSelectPerson).not.toHaveBeenCalled()
    expect(container.querySelector('.pedigree-canvas-svg')).toBeInTheDocument()
  })

  it('カードの選択操作によってSVGのviewBoxは変化しない', () => {
    const onSelectPerson = vi.fn()
    const { container } = render(<PedigreeCanvas selectedPersonId={null} onSelectPerson={onSelectPerson} />)
    const svg = container.querySelector('.pedigree-canvas-svg')
    expect(svg).toBeInTheDocument()
    const viewBoxBefore = svg?.getAttribute('viewBox')

    tapCard(screen.getByText('A'))

    expect(svg?.getAttribute('viewBox')).toBe(viewBoxBefore)
  })
})

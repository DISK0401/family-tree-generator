import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SegmentedControl } from './SegmentedControl'

const ITEMS = [
  { value: 'a', label: '図' },
  { value: 'b', label: '表' },
] as const

describe('SegmentedControl', () => {
  it('群として名前が付き、各項目がボタンになる', () => {
    render(
      <SegmentedControl
        label="表示の切り替え"
        items={ITEMS}
        value="a"
        onChange={() => {}}
      />,
    )
    expect(
      screen.getByRole('group', { name: '表示の切り替え' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '図' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '表' })).toBeInTheDocument()
  })

  it('選択中の項目だけ aria-pressed が true になる', () => {
    render(
      <SegmentedControl
        label="表示の切り替え"
        items={ITEMS}
        value="b"
        onChange={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: '図' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByRole('button', { name: '表' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('項目を押すとその値で onChange が呼ばれる', () => {
    const onChange = vi.fn()
    render(
      <SegmentedControl
        label="表示の切り替え"
        items={ITEMS}
        value="a"
        onChange={onChange}
      />,
    )
    screen.getByRole('button', { name: '表' }).click()
    expect(onChange).toHaveBeenCalledWith('b')
  })

  it('項目はすべて type="button"(フォーム内でも submit しない)', () => {
    render(
      <form>
        <SegmentedControl
          label="表示の切り替え"
          items={ITEMS}
          value="a"
          onChange={() => {}}
        />
      </form>,
    )
    for (const name of ['図', '表']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute(
        'type',
        'button',
      )
    }
  })

  it('既定は枠でくるむ横並び(framed)', () => {
    const { container } = render(
      <SegmentedControl
        label="表示の切り替え"
        items={ITEMS}
        value="a"
        onChange={() => {}}
      />,
    )
    expect(container.firstElementChild?.className).toBe(
      'segmented segmented--framed',
    )
  })

  it('縦積み(stacked)と外枠クラスを指定できる', () => {
    const { container } = render(
      <SegmentedControl
        label="表示モード"
        items={ITEMS}
        value="a"
        onChange={() => {}}
        arrangement="stacked"
        className="surface--overlay tree-view-mode-toggle"
      />,
    )
    expect(container.firstElementChild?.className).toBe(
      'segmented segmented--stacked surface--overlay tree-view-mode-toggle',
    )
  })

  it('項目ごとの差分クラスは基本形の後ろへ足す', () => {
    render(
      <SegmentedControl
        label="表示モード"
        items={[{ value: 'a', label: '折りたたみ表示', className: 'wide' }]}
        value="a"
        onChange={() => {}}
      />,
    )
    expect(
      screen.getByRole('button', { name: '折りたたみ表示' }).className,
    ).toBe('segmented-item wide')
  })
})

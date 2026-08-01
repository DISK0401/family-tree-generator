import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createPerson } from '../domain/helpers'
import type { Person } from '../domain/types'
import { PersonPicker } from './PersonPicker'

/**
 * PersonPickerのlistbox構造とキーボード操作(監査 中7)。
 * 以前はキーボード操作のテストが存在しなかったため、コンボボックスの
 * 標準操作(↑↓/Enter/Escape)と支援技術向けの構造を専用に検証する。
 */

function candidates(): Person[] {
  return [
    createPerson({
      name: { surname: '山田', given: '太郎', surnameKana: 'やまだ' },
    }),
    createPerson({ name: { surname: '山田', given: '次郎' } }),
    createPerson({ name: { surname: '佐藤', given: '花子' } }),
  ]
}

describe('PersonPicker: listboxの構造(中7)', () => {
  it('候補はli自身がrole=option(内側ボタンなし)で、idを持つ', () => {
    render(<PersonPicker candidates={candidates()} onSelect={() => {}} />)
    fireEvent.focus(screen.getByRole('combobox'))

    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(3)
    for (const option of options) {
      expect(option.tagName).toBe('LI')
      expect(option.id).not.toBe('')
      expect(option.querySelector('button')).toBeNull()
    }
  })

  it('ハイライト中の候補がaria-activedescendantとして入力欄へ同期される', () => {
    render(<PersonPicker candidates={candidates()} onSelect={() => {}} />)
    const input = screen.getByRole('combobox')
    fireEvent.focus(input)

    // ハイライト前はactivedescendantなし
    expect(input).not.toHaveAttribute('aria-activedescendant')

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    const options = screen.getAllByRole('option')
    expect(input).toHaveAttribute('aria-activedescendant', options[0].id)
    expect(options[0]).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input).toHaveAttribute('aria-activedescendant', options[1].id)
    expect(options[0]).toHaveAttribute('aria-selected', 'false')
  })
})

describe('PersonPicker: キーボード操作(中7)', () => {
  it('↓でハイライトを進め、↑で戻り、Enterでその候補を選択する', () => {
    const people = candidates()
    const onSelect = vi.fn()
    render(<PersonPicker candidates={people} onSelect={onSelect} />)
    const input = screen.getByRole('combobox')
    fireEvent.focus(input)

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onSelect).toHaveBeenCalledWith(people[0].id)
    // 選択後は入力欄が空へ戻り、候補一覧が閉じる
    expect(input).toHaveValue('')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('ハイライトが無くても候補が1件に絞られていればEnterで選択できる', () => {
    const people = candidates()
    const onSelect = vi.fn()
    render(<PersonPicker candidates={people} onSelect={onSelect} />)
    const input = screen.getByRole('combobox')

    fireEvent.change(input, { target: { value: '花子' } })
    expect(screen.getAllByRole('option')).toHaveLength(1)
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onSelect).toHaveBeenCalledWith(people[2].id)
  })

  it('候補が複数あるときはハイライト無しのEnterでは選択されない', () => {
    const onSelect = vi.fn()
    render(<PersonPicker candidates={candidates()} onSelect={onSelect} />)
    const input = screen.getByRole('combobox')

    fireEvent.change(input, { target: { value: '山田' } })
    expect(screen.getAllByRole('option')).toHaveLength(2)
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onSelect).not.toHaveBeenCalled()
  })

  it('Escapeで候補一覧が閉じる', () => {
    render(<PersonPicker candidates={candidates()} onSelect={() => {}} />)
    const input = screen.getByRole('combobox')
    fireEvent.focus(input)
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    fireEvent.keyDown(input, { key: 'Escape' })

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(input).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('PersonPicker: フォーカス離脱(中7: setTimeout廃止)', () => {
  it('ピッカーの外へフォーカスが移ると候補一覧が閉じる(relatedTarget判定)', () => {
    render(
      <div>
        <PersonPicker candidates={candidates()} onSelect={() => {}} />
        <button type="button">外のボタン</button>
      </div>,
    )
    const input = screen.getByRole('combobox')
    fireEvent.focus(input)
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    fireEvent.blur(input, {
      relatedTarget: screen.getByRole('button', { name: '外のボタン' }),
    })

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('候補のクリックはblurで閉じる前に選択として処理される', () => {
    const people = candidates()
    const onSelect = vi.fn()
    render(<PersonPicker candidates={people} onSelect={onSelect} />)
    const input = screen.getByRole('combobox')
    fireEvent.focus(input)

    fireEvent.click(screen.getByRole('option', { name: '佐藤 花子' }))

    expect(onSelect).toHaveBeenCalledWith(people[2].id)
  })
})

describe('PersonPicker: inline変形(ダイアログ内。デザイン検証の指摘)', () => {
  it('候補リストはフォーカスなしでも常時表示される', () => {
    render(
      <PersonPicker
        candidates={candidates()}
        onSelect={() => {}}
        listLayout="inline"
      />,
    )

    // フォーカス操作なしで最初から表示されている(popoverではフォーカスするまで非表示)
    expect(screen.getAllByRole('option')).toHaveLength(3)
    expect(screen.getByRole('combobox')).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  it('Escapeでリストが消えない(閉じる操作はダイアログ側に委ねる)', () => {
    render(
      <PersonPicker
        candidates={candidates()}
        onSelect={() => {}}
        listLayout="inline"
      />,
    )
    const input = screen.getByRole('combobox')
    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(screen.getAllByRole('option')).toHaveLength(3)
  })

  it('リストは浮かせず文書フローに置かれる(inline用クラスが付く)', () => {
    const { container } = render(
      <PersonPicker
        candidates={candidates()}
        onSelect={() => {}}
        listLayout="inline"
      />,
    )
    expect(container.querySelector('.person-picker--inline')).not.toBeNull()
  })
})

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createPerson } from '../domain/helpers'
import { PersonEditForm } from './PersonEditForm'

describe('PersonEditForm: ダーティ状態検知(design.md D3)', () => {
  it('入力を変更するとonDirtyChange(true)が呼ばれる', () => {
    const person = createPerson({ name: { given: '太郎' } })
    const onDirtyChange = vi.fn()
    render(<PersonEditForm person={person} onSave={vi.fn()} onDirtyChange={onDirtyChange} />)

    onDirtyChange.mockClear()
    fireEvent.change(screen.getByLabelText('名', { exact: true }), { target: { value: '次郎' } })

    expect(onDirtyChange).toHaveBeenCalledWith(true)
  })

  it('確定するとonDirtyChange(false)が呼ばれる(personプロパティが更新された場合)', () => {
    const person = createPerson({ name: { given: '太郎' } })
    const onDirtyChange = vi.fn()
    const { rerender } = render(
      <PersonEditForm person={person} onSave={vi.fn()} onDirtyChange={onDirtyChange} />,
    )

    fireEvent.change(screen.getByLabelText('名', { exact: true }), { target: { value: '次郎' } })
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)

    // 確定後、親から新しいpersonが渡されたことを模す(PersonPanelが再レンダリングする状況に相当)
    const updatedPerson = { ...person, name: { ...person.name, given: '次郎' } }
    rerender(<PersonEditForm person={updatedPerson} onSave={vi.fn()} onDirtyChange={onDirtyChange} />)

    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
  })

  it('マウント直後(未編集)はダーティにならない', () => {
    const person = createPerson({ name: { given: '太郎' } })
    const onDirtyChange = vi.fn()
    render(<PersonEditForm person={person} onSave={vi.fn()} onDirtyChange={onDirtyChange} />)

    expect(onDirtyChange).toHaveBeenCalledWith(false)
    expect(onDirtyChange).not.toHaveBeenCalledWith(true)
  })
})

describe('PersonEditForm: Enterキーによる確定', () => {
  it('テキスト入力でEnterキーを押すとonSaveが実行される(標準のフォーム送信仕様)', () => {
    const person = createPerson({ name: { given: '太郎' } })
    const onSave = vi.fn()
    render(<PersonEditForm person={person} onSave={onSave} />)

    const input = screen.getByLabelText('名', { exact: true })
    fireEvent.change(input, { target: { value: '次郎' } })
    fireEvent.submit(input.closest('form')!)

    expect(onSave).toHaveBeenCalled()
  })
})

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createPerson } from '../../domain/helpers'
import { PersonEditForm } from './PersonEditForm'

describe('PersonEditForm: ダーティ状態検知(design.md D3)', () => {
  it('入力を変更するとonDirtyChange(true)が呼ばれる', () => {
    const person = createPerson({ name: { given: '太郎' } })
    const onDirtyChange = vi.fn()
    render(
      <PersonEditForm
        person={person}
        onSave={vi.fn()}
        onDirtyChange={onDirtyChange}
      />,
    )

    onDirtyChange.mockClear()
    fireEvent.change(screen.getByLabelText('名', { exact: true }), {
      target: { value: '次郎' },
    })

    expect(onDirtyChange).toHaveBeenCalledWith(true)
  })

  it('確定するとonDirtyChange(false)が呼ばれる(personプロパティが更新された場合)', () => {
    const person = createPerson({ name: { given: '太郎' } })
    const onDirtyChange = vi.fn()
    const { rerender } = render(
      <PersonEditForm
        person={person}
        onSave={vi.fn()}
        onDirtyChange={onDirtyChange}
      />,
    )

    fireEvent.change(screen.getByLabelText('名', { exact: true }), {
      target: { value: '次郎' },
    })
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)

    // 確定後、親から新しいpersonが渡されたことを模す(PersonPanelが再レンダリングする状況に相当)
    const updatedPerson = { ...person, name: { ...person.name, given: '次郎' } }
    rerender(
      <PersonEditForm
        person={updatedPerson}
        onSave={vi.fn()}
        onDirtyChange={onDirtyChange}
      />,
    )

    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
  })

  it('マウント直後(未編集)はダーティにならない', () => {
    const person = createPerson({ name: { given: '太郎' } })
    const onDirtyChange = vi.fn()
    render(
      <PersonEditForm
        person={person}
        onSave={vi.fn()}
        onDirtyChange={onDirtyChange}
      />,
    )

    expect(onDirtyChange).toHaveBeenCalledWith(false)
    expect(onDirtyChange).not.toHaveBeenCalledWith(true)
  })
})

describe('PersonEditForm: undo/redo・外部更新への追随(監査 中4)', () => {
  it('未編集のままpersonの内容が変わる(undo相当)と、ダーティにならずフォーム表示が新しい値になる', () => {
    const person = createPerson({ name: { given: '太郎' } })
    const onDirtyChange = vi.fn()
    const { rerender } = render(
      <PersonEditForm
        person={person}
        onSave={vi.fn()}
        onDirtyChange={onDirtyChange}
      />,
    )

    // undoでストアのpersonが別内容へ巻き戻った状況を模す
    const reverted = { ...person, name: { ...person.name, given: '三郎' } }
    rerender(
      <PersonEditForm
        person={reverted}
        onSave={vi.fn()}
        onDirtyChange={onDirtyChange}
      />,
    )

    expect(screen.getByLabelText('名', { exact: true })).toHaveValue('三郎')
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
  })

  it('生没日もpersonの内容変化に追随する(WarekiDateInputの表示ごと)', () => {
    const person = createPerson({ name: { given: '太郎' } })
    const { rerender } = render(
      <PersonEditForm person={person} onSave={vi.fn()} />,
    )

    const withBirth = {
      ...person,
      birth: {
        type: 'birth' as const,
        date: {
          original: '1990-04-01',
          qualifier: 'exact' as const,
          date: { year: 1990, month: 4, day: 1 },
        },
      },
    }
    rerender(<PersonEditForm person={withBirth} onSave={vi.fn()} />)

    expect(screen.getByLabelText('生年月日')).toHaveValue('1990-04-01')
  })

  it('編集中(ダーティ)にpersonが変わっても入力値は消えず、ダーティのまま維持される', () => {
    const person = createPerson({ name: { given: '太郎' } })
    const onDirtyChange = vi.fn()
    const { rerender } = render(
      <PersonEditForm
        person={person}
        onSave={vi.fn()}
        onDirtyChange={onDirtyChange}
      />,
    )

    fireEvent.change(screen.getByLabelText('名', { exact: true }), {
      target: { value: '次郎' },
    })

    const changedElsewhere = {
      ...person,
      name: { ...person.name, given: '三郎' },
    }
    rerender(
      <PersonEditForm
        person={changedElsewhere}
        onSave={vi.fn()}
        onDirtyChange={onDirtyChange}
      />,
    )

    expect(screen.getByLabelText('名', { exact: true })).toHaveValue('次郎')
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)
  })
})

describe('PersonEditForm: 出生順(issue #49)', () => {
  it('出生順を入力して確定すると、onSaveの引数にbirthOrderが数値で渡る', () => {
    const person = createPerson({ name: { given: '太郎' } })
    const onSave = vi.fn()
    render(<PersonEditForm person={person} onSave={onSave} />)

    const input = screen.getByLabelText('出生順(家族内での出生順。任意)')
    fireEvent.change(input, { target: { value: '2' } })
    fireEvent.submit(input.closest('form')!)

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ birthOrder: 2 }),
    )
  })

  it('出生順を未入力のまま確定すると、onSaveの引数のbirthOrderはundefinedになる', () => {
    const person = createPerson({ name: { given: '太郎' } })
    const onSave = vi.fn()
    render(<PersonEditForm person={person} onSave={onSave} />)

    const input = screen.getByLabelText('名', { exact: true })
    fireEvent.submit(input.closest('form')!)

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ birthOrder: undefined }),
    )
  })

  it('既存の出生順が入力欄に反映される', () => {
    const person = createPerson({ name: { given: '太郎' }, birthOrder: 3 })
    render(<PersonEditForm person={person} onSave={vi.fn()} />)

    const input = screen.getByLabelText<HTMLInputElement>(
      '出生順(家族内での出生順。任意)',
    )
    expect(input.value).toBe('3')
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

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addPerson, isUnconnectedPerson } from '../domain/commands'
import { createTreeDocument } from '../domain/helpers'
import { useTreeStore } from '../store/tree-store'
import { AddPersonControl } from './AddPersonControl'

beforeEach(() => {
  const a = addPerson(createTreeDocument(), { name: { given: 'A' } })
  useTreeStore.getState().replace(a.doc)
})

describe('AddPersonControl: 関係を指定しない人物の追加', () => {
  it('氏名を入力して追加するとどの家族にも属さない人物が増える', () => {
    render(<AddPersonControl onAdded={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '人物を追加' }))
    fireEvent.change(screen.getByLabelText('姓'), { target: { value: '富岡' } })
    fireEvent.change(screen.getByLabelText('名'), { target: { value: '榮' } })
    fireEvent.click(screen.getByRole('button', { name: '追加する' }))

    const doc = useTreeStore.getState().document
    expect(Object.values(doc.persons)).toHaveLength(2)
    const added = Object.values(doc.persons).find((p) => p.name.given === '榮')
    expect(added).toBeDefined()
    expect(added && isUnconnectedPerson(doc, added.id)).toBe(true)
    // 家族は作られない
    expect(Object.keys(doc.families)).toHaveLength(0)
  })

  it('追加した人物を選択状態にするため、そのIDを通知する', () => {
    const onAdded = vi.fn()
    render(<AddPersonControl onAdded={onAdded} />)
    fireEvent.click(screen.getByRole('button', { name: '人物を追加' }))
    fireEvent.change(screen.getByLabelText('名'), { target: { value: 'X' } })
    fireEvent.click(screen.getByRole('button', { name: '追加する' }))

    const doc = useTreeStore.getState().document
    const added = Object.values(doc.persons).find((p) => p.name.given === 'X')
    expect(onAdded).toHaveBeenCalledWith(added?.id)
  })

  it('姓も名も空では追加できない', () => {
    render(<AddPersonControl onAdded={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '人物を追加' }))
    expect(screen.getByRole('button', { name: '追加する' }).hasAttribute('disabled')).toBe(true)
  })

  it('追加直後のundoで人物が消える', () => {
    render(<AddPersonControl onAdded={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '人物を追加' }))
    fireEvent.change(screen.getByLabelText('名'), { target: { value: 'X' } })
    fireEvent.click(screen.getByRole('button', { name: '追加する' }))
    expect(Object.values(useTreeStore.getState().document.persons)).toHaveLength(2)

    useTreeStore.getState().undo()
    expect(Object.values(useTreeStore.getState().document.persons)).toHaveLength(1)
  })

  it('キャンセルするとフォームが閉じ、ドキュメントは変化しない', () => {
    const before = useTreeStore.getState().document
    render(<AddPersonControl onAdded={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '人物を追加' }))
    fireEvent.change(screen.getByLabelText('名'), { target: { value: 'X' } })
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))

    expect(screen.queryByRole('button', { name: '追加する' })).toBeNull()
    expect(useTreeStore.getState().document).toBe(before)
  })
})

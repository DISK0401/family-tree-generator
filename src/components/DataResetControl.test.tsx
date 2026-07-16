import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addPerson, addSpouse } from '../domain/commands'
import { createTreeDocument } from '../domain/helpers'
import { useTreeStore } from '../store/tree-store'
import { DataResetControl } from './DataResetControl'

beforeEach(() => {
  let doc = createTreeDocument()
  const r1 = addPerson(doc, { name: { given: '太郎' } })
  doc = r1.doc
  const r2 = addSpouse(doc, r1.personId, { name: { given: '花子' } })
  doc = r2.doc
  useTreeStore.getState().replace(doc)
})

describe('DataResetControl', () => {
  it('確認フレーズを入力するまで削除ボタンは無効', () => {
    const onReset = vi.fn().mockResolvedValue(undefined)
    render(<DataResetControl onReset={onReset} />)

    fireEvent.click(screen.getByRole('button', { name: 'すべてのデータを削除' }))
    expect(screen.getByText(/人物 2 件・家族 1 件/)).toBeInTheDocument()

    const confirmButton = screen.getByRole('button', { name: '削除する' })
    expect(confirmButton).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/続行するには/), { target: { value: '違う' } })
    expect(confirmButton).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/続行するには/), { target: { value: '削除' } })
    expect(confirmButton).toBeEnabled()

    expect(onReset).not.toHaveBeenCalled()
  })

  it('確認フレーズ入力後に削除するとonResetが呼ばれダイアログが閉じる', async () => {
    const onReset = vi.fn().mockResolvedValue(undefined)
    render(<DataResetControl onReset={onReset} />)

    fireEvent.click(screen.getByRole('button', { name: 'すべてのデータを削除' }))
    fireEvent.change(screen.getByLabelText(/続行するには/), { target: { value: '削除' } })
    fireEvent.click(screen.getByRole('button', { name: '削除する' }))

    await vi.waitFor(() => {
      expect(onReset).toHaveBeenCalledTimes(1)
    })
    await vi.waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
  })

  it('キャンセルするとonResetは呼ばれずダイアログが閉じる', () => {
    const onReset = vi.fn().mockResolvedValue(undefined)
    render(<DataResetControl onReset={onReset} />)

    fireEvent.click(screen.getByRole('button', { name: 'すべてのデータを削除' }))
    fireEvent.change(screen.getByLabelText(/続行するには/), { target: { value: '削除' } })
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(onReset).not.toHaveBeenCalled()
  })
})

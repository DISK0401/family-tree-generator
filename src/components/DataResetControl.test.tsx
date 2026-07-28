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

    fireEvent.click(
      screen.getByRole('button', { name: 'すべてのデータを削除' }),
    )
    expect(screen.getByText(/人物 2 件・家族 1 件/)).toBeInTheDocument()

    const confirmButton = screen.getByRole('button', { name: '削除する' })
    expect(confirmButton).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/続行するには/), {
      target: { value: '違う' },
    })
    expect(confirmButton).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/続行するには/), {
      target: { value: '削除' },
    })
    expect(confirmButton).toBeEnabled()

    expect(onReset).not.toHaveBeenCalled()
  })

  it('確認フレーズ入力後に削除するとonResetが呼ばれダイアログが閉じる', async () => {
    const onReset = vi.fn().mockResolvedValue(undefined)
    render(<DataResetControl onReset={onReset} />)

    fireEvent.click(
      screen.getByRole('button', { name: 'すべてのデータを削除' }),
    )
    fireEvent.change(screen.getByLabelText(/続行するには/), {
      target: { value: '削除' },
    })
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

    fireEvent.click(
      screen.getByRole('button', { name: 'すべてのデータを削除' }),
    )
    fireEvent.change(screen.getByLabelText(/続行するには/), {
      target: { value: '削除' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(onReset).not.toHaveBeenCalled()
  })

  it('onResetが失敗してもダイアログは操作可能なまま残り、エラーが表示され、再試行できる(監査 中10)', async () => {
    const onReset = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('IndexedDBの削除に失敗'))
      .mockResolvedValueOnce(undefined)
    render(<DataResetControl onReset={onReset} />)

    fireEvent.click(
      screen.getByRole('button', { name: 'すべてのデータを削除' }),
    )
    fireEvent.change(screen.getByLabelText(/続行するには/), {
      target: { value: '削除' },
    })
    fireEvent.click(screen.getByRole('button', { name: '削除する' }))

    // 失敗: ダイアログは開いたままエラーを表示し、ボタンは無効化されたままにならない
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '削除に失敗しました',
    )
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'キャンセル' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '削除する' })).toBeEnabled()

    // 再試行: 2回目は成功してダイアログが閉じる
    fireEvent.click(screen.getByRole('button', { name: '削除する' }))
    await vi.waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
    expect(onReset).toHaveBeenCalledTimes(2)
  })
})

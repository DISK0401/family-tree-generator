import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmDialog, type ConfirmDialogProps } from './ConfirmDialog'

/** トリガーから開閉する実際の利用形(条件レンダリング)を再現するハーネス */
function Harness(
  props: Partial<ConfirmDialogProps> & { onConfirmSpy?: () => void },
) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        ダイアログを開く
      </button>
      {open && (
        <ConfirmDialog
          title="テストの確認"
          confirmLabel="実行"
          onConfirm={() => {
            props.onConfirmSpy?.()
            setOpen(false)
          }}
          onCancel={() => setOpen(false)}
          {...props}
        >
          <p>本文です</p>
        </ConfirmDialog>
      )}
    </div>
  )
}

describe('ConfirmDialog: ネイティブdialogによるモーダル(監査 高3)', () => {
  it('トリガーで開くとshowModalで表示され(dialog[open])、本文とボタンが描かれる', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'ダイアログを開く' }))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('open')
    expect(dialog.tagName).toBe('DIALOG')
    expect(screen.getByText('テストの確認')).toBeInTheDocument()
    expect(screen.getByText('本文です')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'キャンセル' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '実行' })).toBeInTheDocument()
  })

  it('初期フォーカスは安全側(キャンセルボタン)に置かれる', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'ダイアログを開く' }))
    expect(screen.getByRole('button', { name: 'キャンセル' })).toHaveFocus()
  })

  it('confirmAutoFocusを指定すると確認ボタンへ初期フォーカスされる', () => {
    render(<Harness confirmAutoFocus />)
    fireEvent.click(screen.getByRole('button', { name: 'ダイアログを開く' }))
    expect(screen.getByRole('button', { name: '実行' })).toHaveFocus()
  })

  it('Esc(cancelイベント)で閉じ、フォーカスがトリガーへ戻る', () => {
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'ダイアログを開く' })
    // jsdomのfireEvent.clickは実ブラウザと違いフォーカスを移さないため、明示的に合わせる
    trigger.focus()
    fireEvent.click(trigger)
    const dialog = screen.getByRole('dialog')

    fireEvent.keyDown(dialog, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('キャンセルボタンで閉じ、フォーカスがトリガーへ戻る', () => {
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'ダイアログを開く' })
    trigger.focus()
    fireEvent.click(trigger)

    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('確認ボタンでonConfirmが呼ばれる', () => {
    const onConfirmSpy = vi.fn()
    render(<Harness onConfirmSpy={onConfirmSpy} />)
    fireEvent.click(screen.getByRole('button', { name: 'ダイアログを開く' }))

    fireEvent.click(screen.getByRole('button', { name: '実行' }))

    expect(onConfirmSpy).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('cancelDisabled中はEscでも閉じない(削除実行中の保護)', () => {
    render(<Harness cancelDisabled />)
    fireEvent.click(screen.getByRole('button', { name: 'ダイアログを開く' }))
    const dialog = screen.getByRole('dialog')

    fireEvent.keyDown(dialog, { key: 'Escape' })

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'キャンセル' })).toBeDisabled()
  })

  it('alertdialog指定でrole=alertdialogになる', () => {
    render(<Harness alertdialog />)
    fireEvent.click(screen.getByRole('button', { name: 'ダイアログを開く' }))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('3アクション形: extraActionがキャンセルと確認の間に描かれ、選択できる', () => {
    const onExtra = vi.fn()
    render(
      <Harness
        extraAction={{ label: '破棄して移動', danger: true, onSelect: onExtra }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'ダイアログを開く' }))

    const buttons = screen
      .getAllByRole('button')
      .map((b) => b.textContent)
      .filter((t) => t !== 'ダイアログを開く')
    expect(buttons).toEqual(['キャンセル', '破棄して移動', '実行'])

    fireEvent.click(screen.getByRole('button', { name: '破棄して移動' }))
    expect(onExtra).toHaveBeenCalledTimes(1)
  })

  it('確認ボタンはconfirmDisabledで無効化できる', () => {
    render(<Harness confirmDisabled />)
    fireEvent.click(screen.getByRole('button', { name: 'ダイアログを開く' }))
    expect(screen.getByRole('button', { name: '実行' })).toBeDisabled()
  })
})

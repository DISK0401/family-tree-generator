import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTreeDocument } from '../domain/helpers'
import { useTreeStore } from '../store/tree-store'
import { SettingsMenu } from './SettingsMenu'

beforeEach(() => {
  useTreeStore.getState().replace(createTreeDocument())
})

describe('SettingsMenu: ディスクロージャとしてのa11y(監査 中6)', () => {
  it('トリガーで開閉でき、aria-expandedが追従する', () => {
    render(<SettingsMenu onReset={vi.fn().mockResolvedValue(undefined)} />)
    const trigger = screen.getByRole('button', { name: '設定' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen.getByRole('button', { name: 'すべてのデータを削除' }),
    ).toBeInTheDocument()

    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(
      screen.queryByRole('button', { name: 'すべてのデータを削除' }),
    ).not.toBeInTheDocument()
  })

  it('パネルはrole=menuを名乗らない(メニュー項目のロール要件を満たせないため)', () => {
    render(<SettingsMenu onReset={vi.fn().mockResolvedValue(undefined)} />)
    fireEvent.click(screen.getByRole('button', { name: '設定' }))

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '設定' })).not.toHaveAttribute(
      'aria-haspopup',
    )
  })

  it('Escで閉じ、フォーカスがトリガーへ戻る', () => {
    render(<SettingsMenu onReset={vi.fn().mockResolvedValue(undefined)} />)
    const trigger = screen.getByRole('button', { name: '設定' })
    trigger.focus()
    fireEvent.click(trigger)
    const item = screen.getByRole('button', { name: 'すべてのデータを削除' })
    item.focus()

    fireEvent.keyDown(item, { key: 'Escape' })

    expect(
      screen.queryByRole('button', { name: 'すべてのデータを削除' }),
    ).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('パネルの外側のpointerdownで閉じる', () => {
    render(
      <div>
        <SettingsMenu onReset={vi.fn().mockResolvedValue(undefined)} />
        <p>外側の領域</p>
      </div>,
    )
    fireEvent.click(screen.getByRole('button', { name: '設定' }))
    expect(
      screen.getByRole('button', { name: 'すべてのデータを削除' }),
    ).toBeInTheDocument()

    fireEvent.pointerDown(screen.getByText('外側の領域'))

    expect(
      screen.queryByRole('button', { name: 'すべてのデータを削除' }),
    ).not.toBeInTheDocument()
  })

  it('パネル内のpointerdownでは閉じない', () => {
    render(<SettingsMenu onReset={vi.fn().mockResolvedValue(undefined)} />)
    fireEvent.click(screen.getByRole('button', { name: '設定' }))
    const item = screen.getByRole('button', { name: 'すべてのデータを削除' })

    fireEvent.pointerDown(item)

    expect(
      screen.getByRole('button', { name: 'すべてのデータを削除' }),
    ).toBeInTheDocument()
  })
})

describe('SettingsMenu: インポート無効化の伝播', () => {
  it('importDisabledがImportExportControlへ渡り、無効化の説明が表示される', () => {
    render(
      <SettingsMenu
        onReset={vi.fn().mockResolvedValue(undefined)}
        importDisabled
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '設定' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'GEDCOM/JSONの読み込み・書き出し' }),
    )

    expect(
      screen.getByText(/この状態では読み込んでも保存されません/),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('家系図ファイルを選択')).toBeDisabled()
  })
})

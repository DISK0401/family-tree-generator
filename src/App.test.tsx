import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTreeDocument } from './domain/helpers'
import { useTreeStore } from './store/tree-store'
import App from './App'

beforeEach(() => {
  useTreeStore.getState().replace(createTreeDocument())
})

describe('App', () => {
  it('画面骨格(ヘッダ・キャンバス)が表示され、保存先が端末内であることが明示される', async () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: '家系図帖' })).toBeInTheDocument()
    expect(screen.getByRole('main', { name: '家系図キャンバス' })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText(/この端末にのみ保存されます/)).toBeInTheDocument()
    })
  })

  it('人物ゼロの状態では空状態ガイドが表示される', async () => {
    render(<App />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '家系図をはじめる' })).toBeInTheDocument()
    })
  })

  it('空状態ガイドから最初の人物を追加すると、ガイドが消えデータに反映される', async () => {
    render(<App />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '家系図をはじめる' })).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText('姓'), { target: { value: '山田' } })
    fireEvent.change(screen.getByLabelText('名'), { target: { value: '太郎' } })
    fireEvent.click(screen.getByRole('button', { name: '最初の人物を追加' }))

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: '家系図をはじめる' })).not.toBeInTheDocument()
    })
    expect(Object.values(useTreeStore.getState().document.persons)).toHaveLength(1)
  })
})

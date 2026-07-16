import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('画面骨格(ヘッダ・キャンバス)が表示され、保存先が端末内であることが明示される', async () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: '家系図' })).toBeInTheDocument()
    expect(screen.getByRole('main', { name: '家系図キャンバス' })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText(/この端末にのみ保存されます/)).toBeInTheDocument()
    })
  })
})

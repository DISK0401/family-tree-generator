import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('画面骨格(ヘッダ・キャンバス)が表示される', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: '家系図' })).toBeInTheDocument()
    expect(screen.getByRole('main', { name: '家系図キャンバス' })).toBeInTheDocument()
  })
})

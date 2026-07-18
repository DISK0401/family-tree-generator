import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTreeDocument } from './domain/helpers'
import { useTreeStore } from './store/tree-store'
import { Root } from './Root'

beforeEach(() => {
  useTreeStore.getState().replace(createTreeDocument())
})

describe('Root(パスによる出し分け)', () => {
  it('/ ではランディングが表示され、エディタは表示されない', async () => {
    window.history.replaceState(null, '', '/')
    render(<Root />)
    expect(
      await screen.findByRole('heading', { name: /家族の歴史を/ }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('main', { name: '家系図キャンバス' }),
    ).not.toBeInTheDocument()
  })

  it('/app ではエディタが表示される', async () => {
    window.history.replaceState(null, '', '/app')
    render(<Root />)
    expect(
      await screen.findByRole('main', { name: '家系図キャンバス' }),
    ).toBeInTheDocument()
  })

  it('未知のパスではランディングにフォールバックする', async () => {
    window.history.replaceState(null, '', '/unknown-path')
    render(<Root />)
    expect(
      await screen.findByRole('heading', { name: /家族の歴史を/ }),
    ).toBeInTheDocument()
  })
})

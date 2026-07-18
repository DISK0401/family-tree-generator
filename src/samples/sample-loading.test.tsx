import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import App from '../App'
import { createTreeDocument } from '../domain/helpers'
import type { TreeDocument } from '../domain/types'
import { clearTreeDocument, saveTreeDocument } from '../persistence/db'
import { useTreeStore } from '../store/tree-store'

function documentWithOnePerson(): TreeDocument {
  const doc = createTreeDocument()
  doc.persons['existing'] = {
    id: 'existing',
    name: { surname: '山田', given: '太郎' },
    gender: 'unknown',
  }
  return doc
}

beforeEach(async () => {
  await clearTreeDocument()
  useTreeStore.getState().replace(createTreeDocument())
})

describe('サンプル読み込み(/app?sample=<id>)', () => {
  it('空の状態では確認なしでサンプルが読み込まれ、クエリが除去される', async () => {
    window.history.replaceState(null, '', '/app?sample=natsume-soseki')
    render(<App />)

    await waitFor(() => {
      expect(useTreeStore.getState().document.title).toBe(
        '夏目漱石の家系図(サンプル)',
      )
    })
    expect(Object.keys(useTreeStore.getState().document.persons)).toHaveLength(
      7,
    )
    expect(window.location.search).toBe('')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('不正なサンプルIDは無視され、通常どおり起動する', async () => {
    window.history.replaceState(null, '', '/app?sample=unknown-id')
    render(<App />)

    await waitFor(() => {
      expect(window.location.search).toBe('')
    })
    expect(Object.keys(useTreeStore.getState().document.persons)).toHaveLength(
      0,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('既存データがある場合は確認ダイアログが表示され、確認するまで読み込まれない', async () => {
    await saveTreeDocument(documentWithOnePerson())
    window.history.replaceState(null, '', '/app?sample=tokugawa-ieyasu')
    render(<App />)

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/現在の家系図\(人物1名\)/)).toBeInTheDocument()
    // 確認前は既存データのまま
    expect(Object.keys(useTreeStore.getState().document.persons)).toHaveLength(
      1,
    )
    expect(window.location.search).toBe('')
  })

  it('上書きを拒否すると既存データが保持される', async () => {
    await saveTreeDocument(documentWithOnePerson())
    window.history.replaceState(null, '', '/app?sample=tokugawa-ieyasu')
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'キャンセル' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(Object.keys(useTreeStore.getState().document.persons)).toHaveLength(
      1,
    )
    expect(useTreeStore.getState().document.persons['existing']).toBeDefined()
  })

  it('上書きを確認するとサンプルに置き換わる', async () => {
    await saveTreeDocument(documentWithOnePerson())
    window.history.replaceState(null, '', '/app?sample=tokugawa-ieyasu')
    render(<App />)

    fireEvent.click(
      await screen.findByRole('button', { name: '置き換えて開く' }),
    )

    await waitFor(() => {
      expect(useTreeStore.getState().document.title).toBe(
        '徳川家康の家系図(サンプル)',
      )
    })
    expect(useTreeStore.getState().document.persons['ieyasu']).toBeDefined()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

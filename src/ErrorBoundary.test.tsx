import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

function Bomb(): never {
  throw new Error('描画中の例外')
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ErrorBoundary', () => {
  it('子が正常な場合はそのまま描画する', () => {
    render(
      <ErrorBoundary>
        <p>正常なコンテンツ</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText('正常なコンテンツ')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('子が描画中にthrowするとフォールバックを表示する', () => {
    // Reactが境界へ到達したエラーをconsole.errorへ出すため、テスト出力を汚さないよう黙らせる
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      '画面の描画中に問題が発生しました。データはこの端末に保存されています。再読み込みしてください。',
    )
    expect(
      screen.getByRole('button', { name: '再読み込み' }),
    ).toBeInTheDocument()
  })

  it('再読み込みボタンでリロード処理が呼ばれる', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const onReload = vi.fn()

    render(
      <ErrorBoundary onReload={onReload}>
        <Bomb />
      </ErrorBoundary>,
    )

    fireEvent.click(screen.getByRole('button', { name: '再読み込み' }))
    expect(onReload).toHaveBeenCalledTimes(1)
  })
})

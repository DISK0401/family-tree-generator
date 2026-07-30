import {
  Component,
  type CSSProperties,
  type ErrorInfo,
  type ReactNode,
} from 'react'

/*
 * 描画中の例外や遅延チャンクの読み込み失敗でアプリ全体が白画面のまま固まるのを防ぐ最後の砦。
 * データはIndexedDB(この端末)に保存済みのため、再読み込みで復帰できる旨を必ず伝える。
 * スタイルは既存のapp系CSSチャンクに依存せず(チャンク読み込み失敗時にも表示されるため)、
 * デザイントークン変数+フォールバック値のみの最小限のインラインとする。
 */

interface ErrorBoundaryProps {
  children: ReactNode
  /** 再読み込み処理の差し替え口(テスト用)。既定は location.reload() */
  onReload?: () => void
}

interface ErrorBoundaryState {
  hasError: boolean
}

const frameStyle: CSSProperties = {
  minHeight: '100svh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '24px',
  padding: '32px',
  textAlign: 'center',
  background: 'var(--paper, #f2ede1)',
  color: 'var(--ink, #2b2a27)',
}

const messageStyle: CSSProperties = {
  margin: 0,
  maxWidth: '36em',
  lineHeight: 1.8,
}

const buttonStyle: CSSProperties = {
  font: 'inherit',
  padding: '8px 24px',
  borderRadius: 'var(--radius, 6px)',
  border: '1px solid var(--line-strong, #a89f8a)',
  background: 'var(--paper-raised, #fbf7ec)',
  color: 'var(--ink, #2b2a27)',
  cursor: 'pointer',
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    // 「データを一切サーバーへ送らない」約束のため、エラー報告の送信はせずconsoleにのみ残す
    console.error(
      '画面の描画中に問題が発生しました',
      error,
      info.componentStack,
    )
  }

  handleReload = (): void => {
    if (this.props.onReload) {
      this.props.onReload()
      return
    }
    window.location.reload()
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children
    return (
      <div role="alert" style={frameStyle}>
        <p style={messageStyle}>
          画面の描画中に問題が発生しました。データはこの端末に保存されています。再読み込みしてください。
        </p>
        <button type="button" style={buttonStyle} onClick={this.handleReload}>
          再読み込み
        </button>
      </div>
    )
  }
}

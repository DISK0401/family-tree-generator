import { Suspense, lazy } from 'react'
import { ErrorBoundary } from './ErrorBoundary'
import { resolveRoute } from './routes'

/*
 * ルート単位のコード分割(design.md D2)。
 * ランディング初回表示でエディタ用の重い依存(family-chart/D3等)を読み込ませない。
 * フォールバックは背景色のみの軽量プレースホルダとし、フラッシュを避ける。
 *
 * 遅延チャンクの取得失敗(オフライン・デプロイ直後の旧チャンク参照切れ)や描画中の例外は
 * ErrorBoundaryで受け止め、「データはこの端末に保存されている」ことと再読み込み導線を示す。
 */
const App = lazy(() => import('./App'))
const LandingPage = lazy(() => import('./pages/LandingPage'))

export function Root() {
  const route = resolveRoute(window.location.pathname)
  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <div
            aria-hidden="true"
            style={{ minHeight: '100svh', background: 'var(--paper)' }}
          />
        }
      >
        {route === 'app' ? <App /> : <LandingPage />}
      </Suspense>
    </ErrorBoundary>
  )
}

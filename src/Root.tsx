import { Suspense, lazy } from 'react'
import { resolveRoute } from './routes'

/*
 * ルート単位のコード分割(design.md D2)。
 * ランディング初回表示でエディタ用の重い依存(family-chart/D3等)を読み込ませない。
 * フォールバックは背景色のみの軽量プレースホルダとし、フラッシュを避ける。
 */
const App = lazy(() => import('./App'))
const LandingPage = lazy(() => import('./pages/LandingPage'))

export function Root() {
  const route = resolveRoute(window.location.pathname)
  return (
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
  )
}

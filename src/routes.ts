/**
 * ルーティング(design.md D1)。
 * ページが2種(ランディング/エディタ)しかないため、ルータライブラリは導入せず
 * パス判定のみで出し分ける。ページが3つ以上になったらルータ導入を再検討する。
 */

export type Route = 'landing' | 'app'

/** `/app` 配下はエディタ、それ以外(未知のパス含む)はランディングにフォールバックする */
export function resolveRoute(pathname: string): Route {
  return pathname === '/app' || pathname.startsWith('/app/') ? 'app' : 'landing'
}

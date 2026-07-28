export interface Env {
  ASSETS: Fetcher
  ENVIRONMENT?: string
}

/**
 * コンテンツハッシュ付きファイル名で配信されるパス。内容が変わればファイル名も変わるため、
 * 1年の immutable キャッシュを与えて再訪時の再検証リクエスト(304)自体を無くす。
 * `/fonts/` のwoff2スライス群(600件超)は特に、再検証だけでも体感と Worker 呼び出し数に効く。
 * 注意: `/fonts.css`(ハッシュなし)はこの対象に含めないこと。
 */
const IMMUTABLE_PATH_PREFIXES = ['/assets/', '/fonts/']

/**
 * 全レスポンスに付与するセキュリティヘッダ。
 *
 * CSP はこの製品の中核の約束「家系図データを端末の外に出さない」を
 * プラットフォームレベルで強制する(`connect-src 'self'` により、仮に将来
 * XSS や誤った外部リソース追加が混入しても、外部への送信をブラウザが遮断する)。
 * - script-src 'self': ビルド成果物は外部スクリプト参照ゼロ(インラインscriptも不使用)
 * - style-src 'unsafe-inline': React の style 属性と family-chart/D3 が要求する
 * - img-src data: blob:: SVGのdata URI利用を許容する
 */
const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000',
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await env.ASSETS.fetch(request)
    const headers = new Headers(response.headers)

    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      headers.set(name, value)
    }

    const { pathname } = new URL(request.url)
    if (IMMUTABLE_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
      headers.set('Cache-Control', 'public, max-age=31536000, immutable')
    }

    // "production" と明示されたときだけインデックスを許可するフェイルクローズド判定。
    // 変数の欠落・typo・新環境(staging等)の追加時に、既定が「インデックス許可」に
    // 倒れて dev 相当の環境が検索結果に載る事故を防ぐ
    if (env.ENVIRONMENT !== 'production') {
      headers.set('X-Robots-Tag', 'noindex')
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  },
}

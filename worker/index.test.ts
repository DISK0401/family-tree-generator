import { describe, expect, it, vi } from 'vitest'
import worker from './index'
import type { Env } from './index'

function makeEnv(environment?: string): Env {
  return {
    ...(environment !== undefined && { ENVIRONMENT: environment }),
    ASSETS: {
      fetch: vi.fn(
        async () =>
          new Response('<html></html>', {
            status: 200,
            headers: { 'content-type': 'text/html' },
          }),
      ),
    } as unknown as Fetcher,
  }
}

describe('worker', () => {
  it('adds a noindex header in the dev environment', async () => {
    const request = new Request('https://example.com/')
    const response = await worker.fetch(request, makeEnv('dev'))
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex')
  })

  it('does not add a noindex header in the production environment', async () => {
    const request = new Request('https://example.com/')
    const response = await worker.fetch(request, makeEnv('production'))
    expect(response.headers.get('X-Robots-Tag')).toBeNull()
  })

  // フェイルクローズド: 「production と明示されたときだけインデックス許可」。
  // 変数の欠落・typo・新環境の追加が「インデックス許可」に倒れてはならない
  it('adds a noindex header when ENVIRONMENT is undefined', async () => {
    const request = new Request('https://example.com/')
    const response = await worker.fetch(request, makeEnv(undefined))
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex')
  })

  it('adds a noindex header for unknown environments (e.g. staging)', async () => {
    const request = new Request('https://example.com/')
    const response = await worker.fetch(request, makeEnv('staging'))
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex')
  })

  it('adds security headers to every response', async () => {
    const request = new Request('https://example.com/')
    const response = await worker.fetch(request, makeEnv('production'))
    const csp = response.headers.get('Content-Security-Policy')
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("connect-src 'self'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer')
    expect(response.headers.get('Permissions-Policy')).toContain('camera=()')
    expect(response.headers.get('Strict-Transport-Security')).toBe('max-age=31536000')
  })

  it('marks hashed assets and font slices as immutable', async () => {
    for (const path of ['/assets/index-abc123.js', '/fonts/shippori.0.woff2']) {
      const response = await worker.fetch(
        new Request(`https://example.com${path}`),
        makeEnv('production'),
      )
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable')
    }
  })

  it('does not make HTML or /fonts.css immutable', async () => {
    for (const path of ['/', '/app', '/fonts.css']) {
      const response = await worker.fetch(
        new Request(`https://example.com${path}`),
        makeEnv('production'),
      )
      expect(response.headers.get('Cache-Control')).not.toBe(
        'public, max-age=31536000, immutable',
      )
    }
  })

  it('preserves the upstream status and body', async () => {
    const env = makeEnv('dev')
    const response = await worker.fetch(new Request('https://example.com/'), env)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('<html></html>')
  })
})

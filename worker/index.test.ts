import { describe, expect, it, vi } from 'vitest'
import worker from './index'
import type { Env } from './index'

function makeEnv(environment: string): Env {
  return {
    ENVIRONMENT: environment,
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
})

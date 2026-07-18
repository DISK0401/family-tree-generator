import { describe, expect, it } from 'vitest'
import { resolveRoute } from './routes'

describe('resolveRoute', () => {
  it('ルートパスはランディング', () => {
    expect(resolveRoute('/')).toBe('landing')
  })

  it('/app と /app/ 配下はエディタ', () => {
    expect(resolveRoute('/app')).toBe('app')
    expect(resolveRoute('/app/')).toBe('app')
  })

  it('未知のパスはランディングにフォールバックする', () => {
    expect(resolveRoute('/unknown-path')).toBe('landing')
    expect(resolveRoute('/application')).toBe('landing')
  })
})

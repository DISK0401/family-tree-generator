import { describe, expect, it } from 'vitest'
import { personNameSchema } from './name'

describe('personNameSchema', () => {
  it('旧字体の姓を正規化せずそのまま保持する', () => {
    const name = personNameSchema.parse({ family: '齋藤' })

    expect(name.family).toBe('齋藤')
  })

  it('旧字体を主表記、新字体を別表記として併記できる', () => {
    const name = personNameSchema.parse({
      family: '渡邊',
      alternates: [{ family: '渡辺' }],
    })

    expect(name.family).toBe('渡邊')
    expect(name.alternates).toHaveLength(1)
    expect(name.alternates?.[0].family).toBe('渡辺')
  })

  it('読み仮名を表記と独立に保持する', () => {
    const name = personNameSchema.parse({
      family: '東海林',
      kana: { family: 'しょうじ' },
    })

    expect(name.family).toBe('東海林')
    expect(name.kana?.family).toBe('しょうじ')
  })
})

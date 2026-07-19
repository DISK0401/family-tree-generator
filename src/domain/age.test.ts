import { describe, expect, it } from 'vitest'
import { computeAge } from './age'
import { createPerson } from './helpers'

describe('computeAge', () => {
  it('存命人物の現年齢を計算する(誕生日を迎えている場合)', () => {
    const person = createPerson({
      name: { given: '太郎' },
      birth: { type: 'birth', date: { original: '1990-05-01', qualifier: 'exact', date: { year: 1990, month: 5, day: 1 } } },
    })
    expect(computeAge(person, new Date('2026-07-18'))).toBe(36)
  })

  it('存命人物の現年齢を計算する(誕生日を迎えていない場合)', () => {
    const person = createPerson({
      name: { given: '太郎' },
      birth: { type: 'birth', date: { original: '1990-12-25', qualifier: 'exact', date: { year: 1990, month: 12, day: 25 } } },
    })
    expect(computeAge(person, new Date('2026-07-18'))).toBe(35)
  })

  it('故人の没年齢を計算し、現在日時は使わない', () => {
    const person = createPerson({
      name: { given: '花子' },
      birth: { type: 'birth', date: { original: '1900-01-01', qualifier: 'exact', date: { year: 1900, month: 1, day: 1 } } },
      death: { type: 'death', date: { original: '1980-01-01', qualifier: 'exact', date: { year: 1980, month: 1, day: 1 } } },
    })
    expect(computeAge(person, new Date('2026-07-18'))).toBe(80)
  })

  it('生年が年のみ判明の場合はundefinedを返す', () => {
    const person = createPerson({
      name: { given: '不明' },
      birth: { type: 'birth', date: { original: '1900年頃', qualifier: 'about', date: { year: 1900 } } },
    })
    expect(computeAge(person)).toBeUndefined()
  })

  it('没年月日が年のみ判明の場合はundefinedを返す', () => {
    const person = createPerson({
      name: { given: '不明' },
      birth: { type: 'birth', date: { original: '1900-01-01', qualifier: 'exact', date: { year: 1900, month: 1, day: 1 } } },
      death: { type: 'death', date: { original: '1980年頃', qualifier: 'about', date: { year: 1980 } } },
    })
    expect(computeAge(person)).toBeUndefined()
  })

  it('生年月日が未設定の場合はundefinedを返す', () => {
    const person = createPerson({ name: { given: '不明' } })
    expect(computeAge(person)).toBeUndefined()
  })

  it('deathがイベント自体を持つが日付情報がない場合はundefinedを返す', () => {
    const person = createPerson({
      name: { given: '不明' },
      birth: { type: 'birth', date: { original: '1900-01-01', qualifier: 'exact', date: { year: 1900, month: 1, day: 1 } } },
      death: { type: 'death', place: '東京' },
    })
    expect(computeAge(person)).toBeUndefined()
  })
})

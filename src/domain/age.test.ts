import { describe, expect, it } from 'vitest'
import { computeAge } from './age'
import { createPerson } from './helpers'

describe('computeAge', () => {
  it('存命人物の現年齢を計算する(誕生日を迎えている場合)', () => {
    const person = createPerson({
      name: { given: '太郎' },
      birth: {
        type: 'birth',
        date: {
          original: '1990-05-01',
          qualifier: 'exact',
          date: { year: 1990, month: 5, day: 1 },
        },
      },
    })
    expect(computeAge(person, new Date('2026-07-18'))).toBe(36)
  })

  it('存命人物の現年齢を計算する(誕生日を迎えていない場合)', () => {
    const person = createPerson({
      name: { given: '太郎' },
      birth: {
        type: 'birth',
        date: {
          original: '1990-12-25',
          qualifier: 'exact',
          date: { year: 1990, month: 12, day: 25 },
        },
      },
    })
    expect(computeAge(person, new Date('2026-07-18'))).toBe(35)
  })

  it('故人の没年齢を計算し、現在日時は使わない', () => {
    const person = createPerson({
      name: { given: '花子' },
      birth: {
        type: 'birth',
        date: {
          original: '1900-01-01',
          qualifier: 'exact',
          date: { year: 1900, month: 1, day: 1 },
        },
      },
      death: {
        type: 'death',
        date: {
          original: '1980-01-01',
          qualifier: 'exact',
          date: { year: 1980, month: 1, day: 1 },
        },
      },
    })
    expect(computeAge(person, new Date('2026-07-18'))).toBe(80)
  })

  it('生年が年のみ判明の場合はundefinedを返す', () => {
    const person = createPerson({
      name: { given: '不明' },
      birth: {
        type: 'birth',
        date: {
          original: '1900年頃',
          qualifier: 'about',
          date: { year: 1900 },
        },
      },
    })
    expect(computeAge(person)).toBeUndefined()
  })

  it('没年月日が年のみ判明の場合はundefinedを返す', () => {
    const person = createPerson({
      name: { given: '不明' },
      birth: {
        type: 'birth',
        date: {
          original: '1900-01-01',
          qualifier: 'exact',
          date: { year: 1900, month: 1, day: 1 },
        },
      },
      death: {
        type: 'death',
        date: {
          original: '1980年頃',
          qualifier: 'about',
          date: { year: 1980 },
        },
      },
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
      birth: {
        type: 'birth',
        date: {
          original: '1900-01-01',
          qualifier: 'exact',
          date: { year: 1900, month: 1, day: 1 },
        },
      },
      death: { type: 'death', place: '東京' },
    })
    expect(computeAge(person)).toBeUndefined()
  })
})

describe('computeAge: 不確実な日付は計算しない', () => {
  it('生年月日のqualifierがexact以外(頃)なら、完全な日付でもundefinedを返す', () => {
    const person = createPerson({
      name: { given: '太郎' },
      birth: {
        type: 'birth',
        date: {
          original: '1990年5月1日頃',
          qualifier: 'about',
          date: { year: 1990, month: 5, day: 1 },
        },
      },
    })
    expect(computeAge(person, new Date(2026, 6, 18))).toBeUndefined()
  })

  it('没年月日のqualifierがexact以外(以前)なら、完全な日付でもundefinedを返す', () => {
    const person = createPerson({
      name: { given: '花子' },
      birth: {
        type: 'birth',
        date: {
          original: '1900-01-01',
          qualifier: 'exact',
          date: { year: 1900, month: 1, day: 1 },
        },
      },
      death: {
        type: 'death',
        date: {
          original: '1980年1月1日以前',
          qualifier: 'before',
          date: { year: 1980, month: 1, day: 1 },
        },
      },
    })
    expect(computeAge(person)).toBeUndefined()
  })
})

describe('computeAge: 生没逆転', () => {
  it('没年月日が生年月日より前の場合はundefinedを返す(負の年齢を表示しない)', () => {
    const person = createPerson({
      name: { given: '誤入力' },
      birth: {
        type: 'birth',
        date: {
          original: '1980-01-01',
          qualifier: 'exact',
          date: { year: 1980, month: 1, day: 1 },
        },
      },
      death: {
        type: 'death',
        date: {
          original: '1975-06-01',
          qualifier: 'exact',
          date: { year: 1975, month: 6, day: 1 },
        },
      },
    })
    expect(computeAge(person)).toBeUndefined()
  })

  it('生まれた日に亡くなった場合は0歳になる(逆転ではない)', () => {
    const person = createPerson({
      name: { given: '零' },
      birth: {
        type: 'birth',
        date: {
          original: '1980-01-01',
          qualifier: 'exact',
          date: { year: 1980, month: 1, day: 1 },
        },
      },
      death: {
        type: 'death',
        date: {
          original: '1980-01-01',
          qualifier: 'exact',
          date: { year: 1980, month: 1, day: 1 },
        },
      },
    })
    expect(computeAge(person)).toBe(0)
  })
})

describe('computeAge: 誕生日の境界', () => {
  it('誕生日当日は加齢済み、前日は加齢前(>=の境界)', () => {
    const person = createPerson({
      name: { given: '太郎' },
      birth: {
        type: 'birth',
        date: {
          original: '1990-05-01',
          qualifier: 'exact',
          date: { year: 1990, month: 5, day: 1 },
        },
      },
    })
    expect(computeAge(person, new Date(2020, 4, 1))).toBe(30)
    expect(computeAge(person, new Date(2020, 3, 30))).toBe(29)
  })

  it('うるう年2月29日生まれは、平年の2月28日時点では加齢前・3月1日で加齢済み', () => {
    const person = createPerson({
      name: { given: 'うるう' },
      birth: {
        type: 'birth',
        date: {
          original: '2000-02-29',
          qualifier: 'exact',
          date: { year: 2000, month: 2, day: 29 },
        },
      },
    })
    expect(computeAge(person, new Date(2003, 1, 28))).toBe(2)
    expect(computeAge(person, new Date(2003, 2, 1))).toBe(3)
    expect(computeAge(person, new Date(2004, 1, 29))).toBe(4)
  })
})

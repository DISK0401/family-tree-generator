import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { addPerson, addSpouse } from '../../domain/commands'
import { createPerson, createTreeDocument } from '../../domain/helpers'
import type { Person } from '../../domain/types'
import {
  buildSpouseNames,
  PERSON_TABLE_COLUMNS,
  type ColumnContext,
  type TableColumn,
} from './columns'

function columnById(id: string): TableColumn {
  const column = PERSON_TABLE_COLUMNS.find((c) => c.id === id)
  if (!column) throw new Error(`列が見つからない: ${id}`)
  return column
}

function makeContext(overrides: Partial<ColumnContext> = {}): ColumnContext {
  return {
    birthDateGranularity: 'full',
    deathDateGranularity: 'full',
    calendarMode: 'gregorian',
    spouseNamesOf: () => [],
    ...overrides,
  }
}

function samplePerson(): Person {
  return createPerson({
    name: {
      surname: '山田',
      given: '太郎',
      surnameKana: 'やまだ',
      givenKana: 'たろう',
    },
    gender: 'male',
    birth: {
      type: 'birth',
      date: {
        original: '昭和39年10月10日',
        qualifier: 'exact',
        date: { year: 1964, month: 10, day: 10 },
      },
      place: '東京',
    },
    note: 'メモ1行目\n2行目',
  })
}

describe('列定義: 表示文字列の導出(spec「列構成」)', () => {
  it('人物属性が対応する列の値として導出される', () => {
    const person = samplePerson()
    const ctx = makeContext()
    expect(columnById('surname').getValue(person, ctx)).toBe('山田')
    expect(columnById('given').getValue(person, ctx)).toBe('太郎')
    expect(columnById('surnameKana').getValue(person, ctx)).toBe('やまだ')
    expect(columnById('givenKana').getValue(person, ctx)).toBe('たろう')
    expect(columnById('gender').getValue(person, ctx)).toBe('男')
    expect(columnById('birthDate').getValue(person, ctx)).toBe('1964-10-10')
    expect(columnById('birthPlace').getValue(person, ctx)).toBe('東京')
    expect(columnById('deathDate').getValue(person, ctx)).toBe('')
    expect(columnById('note').getValue(person, ctx)).toBe('メモ1行目\n2行目')
  })

  it('日付列は表示設定(和暦・粒度)に追従する', () => {
    const person = samplePerson()
    expect(
      columnById('birthDate').getValue(
        person,
        makeContext({ calendarMode: 'wareki' }),
      ),
    ).toBe('昭和39年10月10日')
    expect(
      columnById('birthDate').getValue(
        person,
        makeContext({ birthDateGranularity: 'year' }),
      ),
    ).toBe('1964')
  })

  it('構造化日付が無い場合は入力原文で代替表示する', () => {
    const person = createPerson({
      name: {},
      birth: {
        type: 'birth',
        date: { original: '生年不詳(過去帳より)', qualifier: 'about' },
      },
    })
    expect(columnById('birthDate').getValue(person, makeContext())).toBe(
      '生年不詳(過去帳より)',
    )
  })

  it('配偶者列はspouseNamesOfの結果を「、」で連結する(読み取り専用)', () => {
    const person = samplePerson()
    const ctx = makeContext({ spouseNamesOf: () => ['築山殿', '朝日姫'] })
    const column = columnById('spouses')
    expect(column.getValue(person, ctx)).toBe('築山殿、朝日姫')
    expect(column.editable).toBe(false)
    expect(column.parse).toBeUndefined()
  })
})

describe('列定義: セル文字列の解釈', () => {
  const person = samplePerson()

  it('氏名系は前後空白を除いて設定し、空文字で未入力へ戻す', () => {
    const column = columnById('surname')
    expect(column.parse?.(' 佐藤 ', person)).toEqual({
      ok: true,
      patch: { name: { ...person.name, surname: '佐藤' } },
    })
    expect(column.parse?.('', person)).toEqual({
      ok: true,
      patch: { name: { ...person.name, surname: undefined } },
    })
  })

  it('性別は受理表記を解釈し、解釈不能はエラー文言を返す', () => {
    const column = columnById('gender')
    expect(column.parse?.('女', person)).toEqual({
      ok: true,
      patch: { gender: 'female' },
    })
    const error = column.parse?.('ヒト', person)
    expect(error?.ok).toBe(false)
    if (error && !error.ok) expect(error.message).toContain('性別')
  })

  it('日付セルは既存パーサで解釈し、原文を保持する', () => {
    const result = columnById('birthDate').parse?.('平成2年1月2日', person)
    expect(result?.ok).toBe(true)
    if (result?.ok) {
      expect(result.patch.birth?.date?.date).toEqual({
        year: 1990,
        month: 1,
        day: 2,
      })
      expect(result.patch.birth?.date?.original).toBe('平成2年1月2日')
      // 既存の場所は保持される
      expect(result.patch.birth?.place).toBe('東京')
    }
  })

  it('解釈できない日付はエラーになり、パッチを返さない', () => {
    const result = columnById('birthDate').parse?.('昭和99年13月40日', person)
    expect(result?.ok).toBe(false)
  })

  it('日付セルを空にすると日付が消え、場所だけ残ればイベントは保持される', () => {
    const result = columnById('birthDate').parse?.('', person)
    expect(result).toEqual({
      ok: true,
      patch: { birth: { type: 'birth', place: '東京' } },
    })

    const noPlace = createPerson({
      name: {},
      death: {
        type: 'death',
        date: { original: '2000', qualifier: 'exact', date: { year: 2000 } },
      },
    })
    expect(columnById('deathDate').parse?.(' ', noPlace)).toEqual({
      ok: true,
      patch: { death: undefined },
    })
  })

  it('場所セルは日付を保持したまま設定・解除する', () => {
    const result = columnById('birthPlace').parse?.('京都', person)
    expect(result?.ok).toBe(true)
    if (result?.ok) {
      expect(result.patch.birth?.place).toBe('京都')
      expect(result.patch.birth?.date).toBe(person.birth?.date)
    }

    const cleared = columnById('birthPlace').parse?.('', person)
    expect(cleared?.ok).toBe(true)
    if (cleared?.ok) {
      expect(cleared.patch.birth?.place).toBeUndefined()
      expect(cleared.patch.birth?.date).toBe(person.birth?.date)
    }
  })

  it('メモは複数行を整形せず保持し、空文字で未入力へ戻す', () => {
    const column = columnById('note')
    expect(column.parse?.('1行目\n 2行目 ', person)).toEqual({
      ok: true,
      patch: { note: '1行目\n 2行目 ' },
    })
    expect(column.parse?.('', person)).toEqual({
      ok: true,
      patch: { note: undefined },
    })
  })
})

describe('buildSpouseNames: 配偶者列の逆引き', () => {
  it('複数の配偶者を持つ人物に全員のdisplayNameが集まる', () => {
    let doc = createTreeDocument()
    const a = addPerson(doc, { name: { surname: '徳川', given: '家康' } })
    doc = a.doc
    doc = addSpouse(doc, a.personId, { name: { given: '築山殿' } }).doc
    doc = addSpouse(doc, a.personId, { name: { given: '朝日姫' } }).doc

    const names = buildSpouseNames(doc)
    expect(names.get(a.personId)).toEqual(['築山殿', '朝日姫'])
  })

  it('存在しない配偶者参照は無視する', () => {
    const doc = createTreeDocument()
    const withGhost = {
      ...doc,
      families: {
        f1: {
          id: 'f1',
          spouseIds: ['ghost1', 'ghost2'],
          kind: 'unknown' as const,
          events: [],
          children: [],
        },
      },
    }
    expect(buildSpouseNames(withGhost).size).toBe(0)
  })
})

describe('依存境界: 列定義はレンダリング層に依存しない(D2 プランB条項)', () => {
  it('columns.ts が rendering / components を import していない', () => {
    // vitest実行時のcwdはリポジトリルート(import.meta.urlはfile:スキームでないため使わない)
    const source = readFileSync('src/features/person-table/columns.ts', 'utf-8')
    expect(source).not.toMatch(/from '.*\/(rendering|components)\//)
    expect(source).not.toMatch(/from 'react/)
  })
})

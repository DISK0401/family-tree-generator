import { describe, expect, it } from 'vitest'
import {
  compareSiblingOrder,
  deriveBirthOrderLabel,
  type SiblingForBirthOrderLabel,
} from './sibling-order'

describe('compareSiblingOrder', () => {
  it('両者に出生順があれば数値の昇順で比較する', () => {
    expect(
      compareSiblingOrder({ birthOrder: 2, displayName: 'B' }, { birthOrder: 1, displayName: 'A' }),
    ).toBeGreaterThan(0)
  })

  it('片方のみ出生順があれば、それを優先する(生年より優先)', () => {
    // 出生順1(生年不明)は、出生順なし・生年1955年より前に来る
    expect(
      compareSiblingOrder(
        { birthOrder: 1, displayName: 'B' },
        { birthYear: 1955, displayName: 'C' },
      ),
    ).toBeLessThan(0)
    expect(
      compareSiblingOrder(
        { birthYear: 1955, displayName: 'C' },
        { birthOrder: 1, displayName: 'B' },
      ),
    ).toBeGreaterThan(0)
  })

  it('出生順がいずれもなければ生年の昇順で比較する', () => {
    expect(
      compareSiblingOrder(
        { birthYear: 1985, displayName: 'C' },
        { birthYear: 1990, displayName: 'B' },
      ),
    ).toBeLessThan(0)
  })

  it('出生順・生年のいずれもなければ氏名の辞書順で比較する', () => {
    expect(
      compareSiblingOrder({ displayName: 'あやか' }, { displayName: 'かずき' }),
    ).toBeLessThan(0)
  })

  it('生年が判明している方が不明な方より前に来る', () => {
    expect(
      compareSiblingOrder(
        { birthYear: 1985, displayName: 'C' },
        { displayName: 'あ' },
      ),
    ).toBeLessThan(0)
  })
})

describe('deriveBirthOrderLabel', () => {
  it('出生順と性別から長男・次男・長女を導出する', () => {
    const siblings: SiblingForBirthOrderLabel[] = [
      { id: 'a', gender: 'male', birthOrder: 1 },
      { id: 'b', gender: 'female', birthOrder: 2 },
      { id: 'c', gender: 'male', birthOrder: 3 },
    ]
    expect(deriveBirthOrderLabel('a', siblings)).toBe('長男')
    expect(deriveBirthOrderLabel('b', siblings)).toBe('長女')
    expect(deriveBirthOrderLabel('c', siblings)).toBe('次男')
  })

  it('性別不明の兄弟は通し番号に数えない', () => {
    const siblings: SiblingForBirthOrderLabel[] = [
      { id: 'unknown-eldest', gender: 'unknown', birthOrder: 1 },
      { id: 'b', gender: 'male', birthOrder: 2 },
    ]
    expect(deriveBirthOrderLabel('unknown-eldest', siblings)).toBeUndefined()
    expect(deriveBirthOrderLabel('b', siblings)).toBe('長男')
  })

  it('出生順が未設定の兄弟にはラベルが出ない', () => {
    const siblings: SiblingForBirthOrderLabel[] = [
      { id: 'a', gender: 'male' },
      { id: 'b', gender: 'male', birthOrder: 1 },
    ]
    expect(deriveBirthOrderLabel('a', siblings)).toBeUndefined()
    expect(deriveBirthOrderLabel('b', siblings)).toBe('長男')
  })

  it('兄弟の追加によりラベルが再計算される(保存されない)', () => {
    const before: SiblingForBirthOrderLabel[] = [
      { id: 'b', gender: 'male', birthOrder: 2 },
    ]
    expect(deriveBirthOrderLabel('b', before)).toBe('長男')

    const after: SiblingForBirthOrderLabel[] = [
      { id: 'a', gender: 'male', birthOrder: 1 },
      ...before,
    ]
    expect(deriveBirthOrderLabel('b', after)).toBe('次男')
  })

  it('三男以降は漢数字で表現される', () => {
    const siblings: SiblingForBirthOrderLabel[] = [
      { id: 'a', gender: 'male', birthOrder: 1 },
      { id: 'b', gender: 'male', birthOrder: 2 },
      { id: 'c', gender: 'male', birthOrder: 3 },
      { id: 'd', gender: 'male', birthOrder: 4 },
    ]
    expect(deriveBirthOrderLabel('c', siblings)).toBe('三男')
    expect(deriveBirthOrderLabel('d', siblings)).toBe('四男')
  })
})

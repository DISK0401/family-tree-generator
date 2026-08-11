import type { Gender, PersonId } from './types'

/**
 * 兄弟の並び順比較に使う最小限の入力(design.md D3)。
 * layout/ordering.ts・organisms/tree-canvas/to-family-chart-data.tsの双方から
 * 同じ比較ロジックを参照できるよう、表示・レイアウトの具体的なデータ形とは切り離してある。
 */
export interface SiblingSortKey {
  birthOrder?: number
  birthYear?: number
  displayName: string
}

/**
 * 兄弟の並び順比較関数(design.md D3、tree-rendering「子・配偶者の決定的な並び順」)。
 * 優先順位: ①両者に出生順があれば数値比較 ②片方のみにあればそちらを優先
 * ③いずれにもなければ生年昇順(不明な方は後ろ) ④生年もいずれも不明なら氏名の辞書順。
 * すべて同値の場合は0を返す(呼び出し側で人物ID等による最終タイブレークを行う)
 */
export function compareSiblingOrder(
  a: SiblingSortKey,
  b: SiblingSortKey,
): number {
  if (a.birthOrder !== undefined && b.birthOrder !== undefined) {
    return a.birthOrder - b.birthOrder
  }
  if (a.birthOrder !== undefined) return -1
  if (b.birthOrder !== undefined) return 1

  if (a.birthYear !== undefined && b.birthYear !== undefined) {
    return a.birthYear - b.birthYear
  }
  if (a.birthYear !== undefined) return -1
  if (b.birthYear !== undefined) return 1

  return a.displayName.localeCompare(b.displayName, 'ja')
}

/** 出生順位ラベル導出に使う兄弟1人分の最小限の入力 */
export interface SiblingForBirthOrderLabel {
  id: PersonId
  gender: Gender
  birthOrder?: number
}

const KANJI_DIGITS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九']

/** 3番目以降の出生順位を表す漢数字(20以上の稀なケースはアラビア数字へフォールバック) */
function kanjiNumeral(n: number): string {
  if (n < 10) return KANJI_DIGITS[n]
  if (n < 20) return `十${KANJI_DIGITS[n - 10]}`
  return String(n)
}

/** 0始まりの同性別内順位から「長」「次」「三」…の接頭辞を得る */
function ordinalPrefix(rank: number): string {
  if (rank === 0) return '長'
  if (rank === 1) return '次'
  return kanjiNumeral(rank + 1)
}

/**
 * 出生順位ラベル(長男/次男/長女/次女等)の導出(design.md D2、tree-rendering
 * 「出生順位ラベルの表示」)。保存された値ではなく、同じ家族の兄弟全員のリストから
 * 呼び出しのたびに算出する。
 *
 * 性別が「不明」の兄弟は、男女いずれの通し番号にも数えない。出生順が未設定の兄弟も、
 * 相対位置が決定できないため通し番号に数えず、自身にもラベルを表示しない。
 */
export function deriveBirthOrderLabel(
  personId: PersonId,
  siblings: SiblingForBirthOrderLabel[],
): string | undefined {
  const person = siblings.find((s) => s.id === personId)
  if (!person || person.birthOrder === undefined) return undefined
  if (person.gender !== 'male' && person.gender !== 'female') return undefined

  const sameGenderOrdered = siblings
    .filter(
      (s): s is SiblingForBirthOrderLabel & { birthOrder: number } =>
        s.gender === person.gender && s.birthOrder !== undefined,
    )
    .sort((a, b) => a.birthOrder - b.birthOrder)

  const rank = sameGenderOrdered.findIndex((s) => s.id === personId)
  if (rank === -1) return undefined

  const suffix = person.gender === 'male' ? '男' : '女'
  return `${ordinalPrefix(rank)}${suffix}`
}

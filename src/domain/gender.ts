import type { Gender } from './types'

/**
 * 表形式ビューのセル入力・ペースト値から性別を解釈する
 * (spec person-table-editor「日付セル・性別セルの解釈」)。
 *
 * 受理する表記(大文字小文字・前後空白は問わない):
 * - 日本語: 「男」「女」「不明」(「男性」「女性」も慣用として受理する)
 * - 略記: M / F / U
 * - 英語: male / female / unknown
 * - 空文字: `unknown` として受理する。表の空セルは「わからない(記録しない)」を
 *   意味し、既存のフォームで性別を「不明」のままにする操作と同じ扱いとする
 *   (「変更なし」ではない点に注意 — 空セルをペーストすると不明で上書きされる)
 *
 * 上記以外は解釈不能として `undefined` を返す(呼び出し側でセル単位のエラーにする)。
 */
export function parseGenderInput(value: string): Gender | undefined {
  const normalized = value.trim().toLowerCase()
  switch (normalized) {
    case '':
    case '不明':
    case 'u':
    case 'unknown':
      return 'unknown'
    case '男':
    case '男性':
    case 'm':
    case 'male':
      return 'male'
    case '女':
    case '女性':
    case 'f':
    case 'female':
      return 'female'
    default:
      return undefined
  }
}

/** 性別を表のセル・エクスポート表示用の日本語表記にする(parseGenderInputと往復可能) */
export function formatGender(gender: Gender): string {
  switch (gender) {
    case 'male':
      return '男'
    case 'female':
      return '女'
    case 'unknown':
      return '不明'
  }
}

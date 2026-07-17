const DIGITS: Record<string, number> = {
  〇: 0,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
}

/**
 * 漢数字(0〜99)をアラビア数字に変換する。元号年の表記(例: 十, 二十三, 六十四)を想定。
 * 変換できない場合は undefined を返す。
 */
export function kanjiToInt(text: string): number | undefined {
  if (text === '元') {
    return 1
  }
  if (!/^[〇一二三四五六七八九十]+$/.test(text)) {
    return undefined
  }

  if (!text.includes('十')) {
    let result = 0
    for (const char of text) {
      result = result * 10 + DIGITS[char]
    }
    return result
  }

  const parts = text.split('十')
  if (parts.length !== 2) {
    return undefined
  }
  const [tensPart, onesPart] = parts

  const tens = tensPart === '' ? 1 : DIGITS[tensPart]
  if (tens === undefined) {
    return undefined
  }

  let ones = 0
  if (onesPart !== '') {
    if (onesPart.length !== 1 || !(onesPart in DIGITS)) {
      return undefined
    }
    ones = DIGITS[onesPart]
  }

  return tens * 10 + ones
}

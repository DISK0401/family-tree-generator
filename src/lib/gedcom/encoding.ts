export type DetectedEncoding = 'utf-8' | 'utf-16' | 'shift_jis'

export interface EncodingDetectionSuccess {
  success: true
  encoding: DetectedEncoding
  text: string
  /** 判定に不確かさが残る場合の注意喚起(Shift_JISフォールバック・CHAR宣言との食い違い等) */
  warnings: string[]
}

export interface EncodingDetectionFailure {
  success: false
  reason: string
}

export type EncodingDetectionResult =
  EncodingDetectionSuccess | EncodingDetectionFailure

/** CHAR宣言を探す行数の上限。CHARはHEADレコード内にのみ現れるため先頭領域に限定する */
const CHAR_SCAN_MAX_LINES = 100
/** 上記の行数を十分カバーするバイト数(1行80文字強を想定した余裕を持つ) */
const CHAR_SCAN_MAX_BYTES = 16 * 1024

const CHAR_LINE_PATTERN = /^[ \t]*\d+[ \t]+CHAR[ \t]+(\S+)/

/**
 * テキスト先頭領域(最初の100行相当)からCHAR宣言の値を取り出す。
 * 改行コードが\rのみのファイルにも対応するため /\r\n|\r|\n/ で行分割する。
 */
function findDeclaredChar(text: string): string | undefined {
  const lines = text.split(/\r\n|\r|\n/, CHAR_SCAN_MAX_LINES)
  for (const line of lines) {
    const match = CHAR_LINE_PATTERN.exec(line)
    if (match) {
      return match[1].toUpperCase()
    }
  }
  return undefined
}

/**
 * バイト列の先頭領域からCHAR宣言を読む。ヘッダのタグ・キーワードは常にASCII互換のため、
 * latin1(1バイト=1コードポイント)で安全にスキャンできる。実際のデコード方式の
 * 判定には使わない(UTF-16のようにASCII非互換の場合は単に見つからないだけ)。
 */
function declaredCharOf(bytes: Uint8Array): string | undefined {
  const headerScan = new TextDecoder('iso-8859-1').decode(
    bytes.subarray(0, CHAR_SCAN_MAX_BYTES),
  )
  return findDeclaredChar(headerScan)
}

/** CHAR宣言値 → 互換とみなす判定エンコーディング(表に無い宣言値は判定不能として警告しない) */
const DECLARED_CHAR_COMPAT: Record<string, DetectedEncoding[]> = {
  'UTF-8': ['utf-8'],
  UTF8: ['utf-8'],
  // ASCIIはUTF-8の部分集合のため互換とみなす
  ASCII: ['utf-8'],
  UNICODE: ['utf-16'],
  'UTF-16': ['utf-16'],
  SHIFT_JIS: ['shift_jis'],
  'SHIFT-JIS': ['shift_jis'],
  SJIS: ['shift_jis'],
}

const ENCODING_LABEL: Record<DetectedEncoding, string> = {
  'utf-8': 'UTF-8',
  'utf-16': 'UTF-16',
  shift_jis: 'Shift_JIS',
}

/** HEADのCHAR宣言と実際の判定が食い違う場合の警告を返す(判定不能な宣言値は対象外)。 */
function charMismatchWarnings(
  text: string,
  actual: DetectedEncoding,
): string[] {
  const declared = findDeclaredChar(text)
  if (!declared) {
    return []
  }
  const compatible = DECLARED_CHAR_COMPAT[declared]
  if (!compatible || compatible.includes(actual)) {
    return []
  }
  return [
    `ヘッダの文字コード宣言(CHAR ${declared})と実際の判定(${ENCODING_LABEL[actual]})が一致しません`,
  ]
}

function hasUtf8Bom(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  )
}

function hasUtf16LeBom(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe
}

function hasUtf16BeBom(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff
}

/**
 * BOMを持たないUTF-16ファイルをヒューリスティックに検出する。GEDCOMは常に
 * ASCII互換の "0 HEAD" 等で始まるため、先頭付近で1バイトおきに0x00が
 * 高い割合で現れるかどうかで判定できる(実在するGEDCOM 5.5.1テストファイルに
 * BOMなしUTF-16が存在することが判明したため追加した判定)。
 */
function detectBomlessUtf16(
  bytes: Uint8Array,
): 'utf-16be' | 'utf-16le' | undefined {
  const sampleLength =
    Math.min(bytes.length, 40) - (Math.min(bytes.length, 40) % 2)
  if (sampleLength < 8) {
    return undefined
  }
  let evenZero = 0
  let oddZero = 0
  for (let i = 0; i < sampleLength; i += 2) {
    if (bytes[i] === 0x00) {
      evenZero += 1
    }
    if (bytes[i + 1] === 0x00) {
      oddZero += 1
    }
  }
  const pairs = sampleLength / 2
  if (evenZero / pairs > 0.9) {
    return 'utf-16be'
  }
  if (oddZero / pairs > 0.9) {
    return 'utf-16le'
  }
  return undefined
}

const UNDETERMINED_ENCODING_REASON =
  '文字コードを判定できませんでした。UTF-8で保存し直してください'

/**
 * GEDCOMファイルのバイト列から文字コードを判定してデコードする。
 * 判定順序: ANSEL宣言の検出(中断)→ UTF-16 BOM → BOMなしUTF-16(ヒューリスティック)
 * → UTF-8(BOM有無とも)→ Shift_JIS(国産ソフト由来ファイル対策のフォールバック)。
 * Shift_JISはほぼ任意のバイト列を「デコード成功」してしまうため、GEDCOMとしての
 * 体裁(0 HEAD行)を確認したうえで、成功時も必ず確認を促す警告を付ける。
 */
export function decodeGedcomBytes(bytes: Uint8Array): EncodingDetectionResult {
  if (declaredCharOf(bytes) === 'ANSEL') {
    return {
      success: false,
      reason:
        'ANSELエンコーディングは未対応です。UTF-8で再エクスポートしたファイルをご利用ください。',
    }
  }

  if (hasUtf16LeBom(bytes)) {
    const text = new TextDecoder('utf-16le').decode(bytes)
    return {
      success: true,
      encoding: 'utf-16',
      text,
      warnings: charMismatchWarnings(text, 'utf-16'),
    }
  }
  if (hasUtf16BeBom(bytes)) {
    const text = new TextDecoder('utf-16be').decode(bytes)
    return {
      success: true,
      encoding: 'utf-16',
      text,
      warnings: charMismatchWarnings(text, 'utf-16'),
    }
  }

  const bomlessUtf16 = detectBomlessUtf16(bytes)
  if (bomlessUtf16) {
    const text = new TextDecoder(bomlessUtf16).decode(bytes)
    return {
      success: true,
      encoding: 'utf-16',
      text,
      warnings: charMismatchWarnings(text, 'utf-16'),
    }
  }

  if (hasUtf8Bom(bytes)) {
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      return {
        success: true,
        encoding: 'utf-8',
        text,
        warnings: charMismatchWarnings(text, 'utf-8'),
      }
    } catch {
      return {
        success: false,
        reason:
          'UTF-8として読み込めませんでした(ファイルが破損している可能性があります)',
      }
    }
  }

  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return {
      success: true,
      encoding: 'utf-8',
      text,
      warnings: charMismatchWarnings(text, 'utf-8'),
    }
  } catch {
    // UTF-8として不正な場合はShift_JISへフォールバックする
  }

  try {
    const text = new TextDecoder('shift_jis', { fatal: true }).decode(bytes)
    // 置換文字が現れる、またはGEDCOMの体裁(0 HEAD行)が無い場合は、
    // 「たまたまShift_JISとして読めた無関係なバイト列」とみなして失敗にする
    if (text.includes('\uFFFD') || !/^0[ \t]+HEAD/m.test(text)) {
      return { success: false, reason: UNDETERMINED_ENCODING_REASON }
    }
    return {
      success: true,
      encoding: 'shift_jis',
      text,
      warnings: [
        'Shift_JISとして読み込みました。文字化けがないか確認してください',
        ...charMismatchWarnings(text, 'shift_jis'),
      ],
    }
  } catch {
    return { success: false, reason: UNDETERMINED_ENCODING_REASON }
  }
}

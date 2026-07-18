export type DetectedEncoding = 'utf-8' | 'utf-16' | 'shift_jis'

export interface EncodingDetectionSuccess {
  success: true
  encoding: DetectedEncoding
  text: string
}

export interface EncodingDetectionFailure {
  success: false
  reason: string
}

export type EncodingDetectionResult =
  EncodingDetectionSuccess | EncodingDetectionFailure

const CHAR_LINE_PATTERN = /^[ \t]*\d+[ \t]+CHAR[ \t]+(\S+)/m

function declaresAnsel(bytes: Uint8Array): boolean {
  // ヘッダのタグ・キーワードは常にASCII互換のため、latin1(1バイト=1コードポイント)で
  // 安全にスキャンできる。実際のデコード方式の判定には使わない。
  const headerScan = new TextDecoder('iso-8859-1').decode(bytes)
  const match = CHAR_LINE_PATTERN.exec(headerScan)
  return match?.[1]?.toUpperCase() === 'ANSEL'
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

/**
 * GEDCOMファイルのバイト列から文字コードを判定してデコードする。
 * 判定順序: ANSEL宣言の検出(中断)→ UTF-16 BOM → BOMなしUTF-16(ヒューリスティック)
 * → UTF-8(BOM有無とも)→ Shift_JIS(国産ソフト由来ファイル対策のフォールバック)。
 */
export function decodeGedcomBytes(bytes: Uint8Array): EncodingDetectionResult {
  if (declaresAnsel(bytes)) {
    return {
      success: false,
      reason:
        'ANSELエンコーディングは未対応です。UTF-8で再エクスポートしたファイルをご利用ください。',
    }
  }

  if (hasUtf16LeBom(bytes)) {
    return {
      success: true,
      encoding: 'utf-16',
      text: new TextDecoder('utf-16le').decode(bytes),
    }
  }
  if (hasUtf16BeBom(bytes)) {
    return {
      success: true,
      encoding: 'utf-16',
      text: new TextDecoder('utf-16be').decode(bytes),
    }
  }

  const bomlessUtf16 = detectBomlessUtf16(bytes)
  if (bomlessUtf16) {
    return {
      success: true,
      encoding: 'utf-16',
      text: new TextDecoder(bomlessUtf16).decode(bytes),
    }
  }

  if (hasUtf8Bom(bytes)) {
    try {
      return {
        success: true,
        encoding: 'utf-8',
        text: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
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
    return {
      success: true,
      encoding: 'utf-8',
      text: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    }
  } catch {
    // UTF-8として不正な場合はShift_JISへフォールバックする
  }

  try {
    return {
      success: true,
      encoding: 'shift_jis',
      text: new TextDecoder('shift_jis', { fatal: true }).decode(bytes),
    }
  } catch {
    return {
      success: false,
      reason:
        '文字コードを判定できませんでした(UTF-8・Shift_JISのいずれでも読み込めません)',
    }
  }
}

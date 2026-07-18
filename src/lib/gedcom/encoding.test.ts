import { describe, expect, it } from 'vitest'
import { decodeGedcomBytes } from './encoding'

function utf8Bytes(text: string, withBom = false): Uint8Array {
  const encoded = new TextEncoder().encode(text)
  if (!withBom) {
    return encoded
  }
  const bom = new Uint8Array([0xef, 0xbb, 0xbf])
  const combined = new Uint8Array(bom.length + encoded.length)
  combined.set(bom, 0)
  combined.set(encoded, bom.length)
  return combined
}

function utf16LeBytes(text: string, withBom = true): Uint8Array {
  const body = new Uint8Array(text.length * 2)
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    body[i * 2] = code & 0xff
    body[i * 2 + 1] = (code >> 8) & 0xff
  }
  if (!withBom) {
    return body
  }
  const bom = new Uint8Array([0xff, 0xfe])
  const combined = new Uint8Array(bom.length + body.length)
  combined.set(bom, 0)
  combined.set(body, bom.length)
  return combined
}

function utf16BeBytes(text: string): Uint8Array {
  const body = new Uint8Array(text.length * 2)
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    body[i * 2] = (code >> 8) & 0xff
    body[i * 2 + 1] = code & 0xff
  }
  return body
}

// '0 @I1@ INDI\n1 NAME 山田/太郎/\n' の Shift_JIS バイト表現
const SHIFT_JIS_FIXTURE = new Uint8Array([
  0x30, 0x20, 0x40, 0x49, 0x31, 0x40, 0x20, 0x49, 0x4e, 0x44, 0x49, 0x0a, 0x31,
  0x20, 0x4e, 0x41, 0x4d, 0x45, 0x20, 0x8e, 0x52, 0x93, 0x63, 0x2f, 0x91, 0xbe,
  0x98, 0x59, 0x2f, 0x0a,
])

describe('decodeGedcomBytes', () => {
  it('BOMなしUTF-8を判定してデコードする', () => {
    const text = '0 HEAD\n1 CHAR UTF-8\n'
    const result = decodeGedcomBytes(utf8Bytes(text))

    expect(result).toEqual({ success: true, encoding: 'utf-8', text })
  })

  it('BOM付きUTF-8を判定してデコードする(BOMは除去される)', () => {
    const text = '0 HEAD\n1 CHAR UTF-8\n'
    const result = decodeGedcomBytes(utf8Bytes(text, true))

    expect(result).toEqual({ success: true, encoding: 'utf-8', text })
  })

  it('UTF-16(LE, BOM付き)を判定してデコードする', () => {
    const text = '0 HEAD\n1 CHAR UNICODE\n'
    const result = decodeGedcomBytes(utf16LeBytes(text))

    expect(result).toEqual({ success: true, encoding: 'utf-16', text })
  })

  it('BOMなしUTF-16LEをヒューリスティックで判定してデコードする(実在するGEDCOM 5.5.1テストファイルに存在するパターン)', () => {
    const text = '0 HEAD\n1 SOUR conversion test\n1 CHAR UTF-8\n'
    const result = decodeGedcomBytes(utf16LeBytes(text, false))

    expect(result).toEqual({ success: true, encoding: 'utf-16', text })
  })

  it('BOMなしUTF-16BEをヒューリスティックで判定してデコードする', () => {
    const text = '0 HEAD\n1 SOUR conversion test\n1 CHAR UTF-8\n'
    const result = decodeGedcomBytes(utf16BeBytes(text))

    expect(result).toEqual({ success: true, encoding: 'utf-16', text })
  })

  it('Shift_JISファイルを判定し日本語氏名を文字化けなく読み込む', () => {
    const result = decodeGedcomBytes(SHIFT_JIS_FIXTURE)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.encoding).toBe('shift_jis')
      expect(result.text).toContain('山田/太郎/')
    }
  })

  it('ANSEL宣言を検出してインポートを中断する', () => {
    const text = '0 HEAD\n1 CHAR ANSEL\n'
    const result = decodeGedcomBytes(utf8Bytes(text))

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.reason).toContain('ANSEL')
    }
  })
})

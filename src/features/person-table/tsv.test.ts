import { describe, expect, it } from 'vitest'
import { parseTsv, serializeTsv } from './tsv'

describe('serializeTsv: 表計算ソフト互換の書き出し(D4)', () => {
  it('通常のセルはタブ区切り・CRLF行区切りで書き出す', () => {
    expect(
      serializeTsv([
        ['山田', '太郎'],
        ['佐藤', '花子'],
      ]),
    ).toBe('山田\t太郎\r\n佐藤\t花子')
  })

  it('改行を含むセルは引用符で囲む(表計算ソフトで1セルに収まる)', () => {
    expect(serializeTsv([['メモ1行目\n2行目', 'x']])).toBe(
      '"メモ1行目\n2行目"\tx',
    )
  })

  it('タブ・引用符を含むセルは引用し、引用符は2つ重ねる', () => {
    expect(serializeTsv([['a\tb']])).toBe('"a\tb"')
    expect(serializeTsv([['彼は"太郎"と言った']])).toBe(
      '"彼は""太郎""と言った"',
    )
  })

  it('空セルはそのまま空として書き出す', () => {
    expect(serializeTsv([['a', '', 'c']])).toBe('a\t\tc')
  })
})

describe('parseTsv: 表計算ソフトからの取り込み(D4)', () => {
  it('タブ区切り・複数行をパースする', () => {
    expect(parseTsv('山田\t太郎\n佐藤\t花子')).toEqual([
      ['山田', '太郎'],
      ['佐藤', '花子'],
    ])
  })

  it('引用内の改行はセル値として保持し、CRLFはLFへ正規化する', () => {
    expect(parseTsv('"メモ1行目\r\n2行目"\tx')).toEqual([
      ['メモ1行目\n2行目', 'x'],
    ])
  })

  it('引用内の連続する引用符はリテラルの引用符になる', () => {
    expect(parseTsv('"彼は""太郎""と言った"')).toEqual([['彼は"太郎"と言った']])
  })

  it('末尾の空セル・空行の途中行を保持する', () => {
    expect(parseTsv('a\t\t')).toEqual([['a', '', '']])
    expect(parseTsv('a\n\nb')).toEqual([['a'], [''], ['b']])
  })

  it('末尾の行区切り1つは無視する(Excelのコピーは末尾CRLF付き)', () => {
    expect(parseTsv('a\tb\r\n')).toEqual([['a', 'b']])
    expect(parseTsv('')).toEqual([])
    expect(parseTsv('\r\n')).toEqual([])
  })

  it('直列化とパースで往復できる', () => {
    const rows = [
      ['山田', '太郎', 'メモ\n複数行\tタブ"引用"'],
      ['', '花子', ''],
    ]
    expect(parseTsv(serializeTsv(rows))).toEqual(rows)
  })
})

describe('実アプリのコピー出力パターン(2.2 フィクスチャ)', () => {
  it('Excel: CRLF行区切り・改行入りセルは引用・末尾CRLF', () => {
    // Excel for Windows で「氏名2列+改行入りメモ」の2行3列をコピーした形
    const excel = '山田\t太郎\t"長男。\n跡継ぎ。"\r\n佐藤\t花子\t\r\n'
    expect(parseTsv(excel)).toEqual([
      ['山田', '太郎', '長男。\n跡継ぎ。'],
      ['佐藤', '花子', ''],
    ])
  })

  it('Google スプレッドシート: LF行区切り', () => {
    const sheets = '山田\t太郎\n"改行\nあり"\t女'
    expect(parseTsv(sheets)).toEqual([
      ['山田', '太郎'],
      ['改行\nあり', '女'],
    ])
  })

  it('崩れた入力(閉じ引用の後に文字が続く)も失敗にせず連結する', () => {
    expect(parseTsv('"a"b\tc')).toEqual([['ab', 'c']])
  })
})

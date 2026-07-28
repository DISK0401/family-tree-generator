import type { GedcomNode } from '../../domain/gedcomNode'
import type { GedcomVersion } from './version'

/** GEDCOM 5.5.1で1行あたりの値をCONC分割する際の目安上限文字数。 */
const MAX_VALUE_CHUNK = 200

/**
 * CONC分割を適用するタグ。GEDCOM 5.5.1でCONT/CONCによる継続が想定されるのは
 * NOTE系の長文テキストコンテキストに限られるため、それ以外のタグの200文字超は
 * 分割せずそのまま1行で出力する(不正な文脈へのCONC挿入を避ける)。
 */
const CONC_ALLOWED_TAGS = new Set(['NOTE', 'TEXT'])

/**
 * ポインタ値(@X@形式のクロスリファレンス)の判定。
 * nodeHelpers.pointerToXref が受理する形と揃える。
 */
const POINTER_VALUE_PATTERN = /^@[^@]+@$/

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff
}

/**
 * CONC分割のチャンク境界を決める。
 * - サロゲートペアの途中で切らない(境界が高位サロゲートの直後なら1文字延ばす。
 *   切ってしまうと再結合しないツールでU+FFFDに化ける)
 * - チャンク末尾が空白になる位置を避けて語中で切る(5.5.1には行末空白を
 *   トリムする実装があり、空白が失われるため。全て空白で戻せない場合は諦める)
 */
function findChunkEnd(text: string, start: number): number {
  let end = Math.min(start + MAX_VALUE_CHUNK, text.length)
  if (end >= text.length) {
    return text.length
  }
  if (isHighSurrogate(text.charCodeAt(end - 1))) {
    end += 1
    if (end >= text.length) {
      return text.length
    }
  }
  let adjusted = end
  while (adjusted > start + 1 && text.charCodeAt(adjusted - 1) === 0x20) {
    adjusted -= 1
  }
  if (text.charCodeAt(adjusted - 1) !== 0x20) {
    end = adjusted
  }
  return end
}

function chunkText(text: string): string[] {
  if (text.length <= MAX_VALUE_CHUNK) {
    return [text]
  }
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    const end = findChunkEnd(text, start)
    chunks.push(text.slice(start, end))
    start = end
  }
  return chunks
}

/**
 * 行値の先頭 `@` をGEDCOMのエスケープ規約(`@@`)で出力する。
 * ポインタ値(@X@)はクロスリファレンスそのものなのでエスケープしない。
 * CONT/CONC行の値はテキスト断片でありポインタになり得ないため常にエスケープする。
 */
function escapeLeadingAt(value: string, allowPointer: boolean): string {
  if (!value.startsWith('@')) {
    return value
  }
  if (allowPointer && POINTER_VALUE_PATTERN.test(value)) {
    return value
  }
  return `@${value}`
}

function formatLine(
  level: number,
  xref: string | undefined,
  tag: string,
  value: string | undefined,
): string {
  const parts = [String(level)]
  if (xref) {
    parts.push(`@${xref}@`)
  }
  parts.push(tag)
  if (value !== undefined && value !== '') {
    parts.push(value)
  }
  return parts.join(' ')
}

function serializeNode(
  node: GedcomNode,
  level: number,
  out: string[],
  version: GedcomVersion,
): void {
  if (node.value === undefined) {
    out.push(formatLine(level, node.xref, node.tag, undefined))
  } else {
    // JSON経由などで値に混入し得るCR(\r\n / \r)を\nへ正規化してから行分割する。
    // 生の\rが行内に残ると、出力テキストを行分割する処理系(本アプリのパーサ含む)で
    // 行構造が壊れ、値の中身を偽のGEDCOM行として注入できてしまうため。
    const normalized = node.value.replace(/\r\n?/g, '\n')
    const lines = normalized.split('\n')
    // GEDCOM 7.0はCONCを廃止しているため、値の長さによる分割は5.5.1のみ行う
    // (CONTは両バージョンとも改行の表現として使う)。
    const splitLongValues =
      version === '5.5.1' && CONC_ALLOWED_TAGS.has(node.tag)

    const firstChunks = splitLongValues ? chunkText(lines[0]) : [lines[0]]
    out.push(
      formatLine(
        level,
        node.xref,
        node.tag,
        escapeLeadingAt(firstChunks[0], true),
      ),
    )
    for (let i = 1; i < firstChunks.length; i += 1) {
      out.push(
        formatLine(
          level + 1,
          undefined,
          'CONC',
          escapeLeadingAt(firstChunks[i], false),
        ),
      )
    }

    for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
      const segmentChunks = splitLongValues
        ? chunkText(lines[lineIndex])
        : [lines[lineIndex]]
      out.push(
        formatLine(
          level + 1,
          undefined,
          'CONT',
          escapeLeadingAt(segmentChunks[0] ?? '', false),
        ),
      )
      for (let i = 1; i < segmentChunks.length; i += 1) {
        out.push(
          formatLine(
            level + 1,
            undefined,
            'CONC',
            escapeLeadingAt(segmentChunks[i], false),
          ),
        )
      }
    }
  }

  for (const child of node.children) {
    serializeNode(child, level + 1, out, version)
  }
}

/**
 * GedcomNode のツリーをGEDCOMテキストへシリアライズする。
 * versionが5.5.1の場合のみNOTE系タグの長文値をCONCで分割する
 * (7.0はCONC廃止のため値の長さ分割を一切行わない)。
 */
export function serializeGedcomTree(
  roots: GedcomNode[],
  version: GedcomVersion = '5.5.1',
): string {
  const out: string[] = []
  for (const root of roots) {
    serializeNode(root, 0, out, version)
  }
  return out.join('\n') + '\n'
}

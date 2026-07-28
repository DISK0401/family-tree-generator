import type { GedcomNode } from '../../domain/gedcomNode'

export interface GedcomParseWarning {
  lineNumber: number
  message: string
}

export interface GedcomParseResult {
  roots: GedcomNode[]
  warnings: GedcomParseWarning[]
}

interface RawLine {
  level: number
  xref?: string
  tag: string
  value?: string
  lineNumber: number
}

const LINE_PATTERN = /^(\d+)\s+(?:(@[^@\s]+@)\s+)?([A-Za-z0-9_.]+)(?:\s(.*))?$/
const LEADING_BOM_PATTERN = /^\uFEFF/

/** 警告メッセージへ埋め込む行内容の上限文字数(長大な行での警告の肥大を防ぐ) */
const WARNING_SNIPPET_LIMIT = 60

/** 警告メッセージへ埋め込む行内容を上限文字数で切り詰める */
function truncateForWarning(text: string): string {
  return text.length <= WARNING_SNIPPET_LIMIT
    ? text
    : `${text.slice(0, WARNING_SNIPPET_LIMIT)}…`
}

/**
 * 行値の先頭にあるエスケープ済み `@@` を `@` へ復号する。
 * ポインタ値(@X@)のxref内に `@` は現れないため `@@` 始まりと衝突しない。
 */
function decodeLeadingAt(value: string | undefined): string | undefined {
  if (value !== undefined && value.startsWith('@@')) {
    return value.slice(1)
  }
  return value
}

function parseLine(text: string, lineNumber: number): RawLine | undefined {
  const match = LINE_PATTERN.exec(text)
  if (!match) {
    return undefined
  }
  const [, levelText, xref, tag, value] = match
  return {
    level: Number(levelText),
    xref: xref ? xref.slice(1, -1) : undefined,
    tag,
    value,
    lineNumber,
  }
}

/**
 * GEDCOMテキストを行構文(level / xref / tag / value)に基づき解析し、
 * GedcomNode のツリーを構築する。CONT/CONC は親ノードの値へ結合する。
 * 解釈できない行は警告として収集し、パース自体は継続する。
 */
export function parseGedcomText(text: string): GedcomParseResult {
  const lines = text.split(/\r\n|\r|\n/)
  const warnings: GedcomParseWarning[] = []
  const roots: GedcomNode[] = []
  const stack: { level: number; node: GedcomNode }[] = []

  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1
    const line = rawLine.replace(LEADING_BOM_PATTERN, '')
    if (line.trim() === '') {
      return
    }

    const parsed = parseLine(line, lineNumber)
    if (!parsed) {
      warnings.push({
        lineNumber,
        message: `解釈できない行のため読み飛ばしました: ${truncateForWarning(line)}`,
      })
      return
    }

    if (parsed.tag === 'CONT' || parsed.tag === 'CONC') {
      const parent = stack[stack.length - 1]
      if (!parent) {
        warnings.push({
          lineNumber,
          message: `${parsed.tag} タグの親要素が見つからないため読み飛ばしました`,
        })
        return
      }
      // CONT/CONCは直前の行(親レベル+1)にのみ従属できる。レベルが合わない
      // CONT/CONCをそのまま結合すると無関係なノードの値を書き換えてしまうため、
      // 警告を出して読み飛ばす。
      if (parsed.level !== parent.level + 1) {
        warnings.push({
          lineNumber,
          message: `${parsed.tag} タグの階層レベルが不正なため読み飛ばしました(期待: ${parent.level + 1}、実際: ${parsed.level})`,
        })
        return
      }
      const addition = decodeLeadingAt(parsed.value) ?? ''
      parent.node.value =
        parsed.tag === 'CONT'
          ? `${parent.node.value ?? ''}\n${addition}`
          : `${parent.node.value ?? ''}${addition}`
      return
    }

    const node: GedcomNode = {
      tag: parsed.tag,
      value: decodeLeadingAt(parsed.value),
      xref: parsed.xref,
      lineNumber: parsed.lineNumber,
      children: [],
    }

    while (stack.length > 0 && stack[stack.length - 1].level >= parsed.level) {
      stack.pop()
    }

    if (stack.length === 0) {
      if (parsed.level !== 0) {
        warnings.push({
          lineNumber,
          message: `階層構造上の親が見つからないレベル${parsed.level}の行です(最上位として扱います)`,
        })
      }
      roots.push(node)
    } else {
      const parent = stack[stack.length - 1]
      // レベルの飛び(親+1超)は構造の乱れの兆候だが、従来どおり最も近い親の
      // 子として取り込み、警告のみ出す。
      if (parsed.level > parent.level + 1) {
        warnings.push({
          lineNumber,
          message: `階層レベルが飛んでいます(親レベル${parent.level}の直下にレベル${parsed.level})。最も近い親の子として取り込みました`,
        })
      }
      parent.node.children.push(node)
    }

    stack.push({ level: parsed.level, node })
  })

  return { roots, warnings }
}

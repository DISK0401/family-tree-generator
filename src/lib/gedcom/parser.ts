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
        message: `解釈できない行のため読み飛ばしました: ${line}`,
      })
      return
    }

    if (parsed.tag === 'CONT' || parsed.tag === 'CONC') {
      const parent = stack[stack.length - 1]?.node
      if (!parent) {
        warnings.push({
          lineNumber,
          message: `${parsed.tag} タグの親要素が見つからないため読み飛ばしました`,
        })
        return
      }
      const addition = parsed.value ?? ''
      parent.value =
        parsed.tag === 'CONT'
          ? `${parent.value ?? ''}\n${addition}`
          : `${parent.value ?? ''}${addition}`
      return
    }

    const node: GedcomNode = {
      tag: parsed.tag,
      value: parsed.value,
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
      stack[stack.length - 1].node.children.push(node)
    }

    stack.push({ level: parsed.level, node })
  })

  return { roots, warnings }
}

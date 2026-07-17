import type { GedcomNode } from '../../domain/gedcomNode'

/** GEDCOM 1行あたりの値の目安上限文字数。超過分はCONCで分割する。 */
const MAX_VALUE_CHUNK = 200

function chunkText(text: string, size: number): string[] {
  if (text.length <= size) {
    return [text]
  }
  const chunks: string[] = []
  for (let index = 0; index < text.length; index += size) {
    chunks.push(text.slice(index, index + size))
  }
  return chunks
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

function serializeNode(node: GedcomNode, level: number, out: string[]): void {
  if (node.value === undefined) {
    out.push(formatLine(level, node.xref, node.tag, undefined))
  } else {
    const lines = node.value.split('\n')
    const firstChunks = chunkText(lines[0], MAX_VALUE_CHUNK)
    out.push(formatLine(level, node.xref, node.tag, firstChunks[0]))
    for (let i = 1; i < firstChunks.length; i += 1) {
      out.push(formatLine(level + 1, undefined, 'CONC', firstChunks[i]))
    }

    for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
      const segmentChunks = chunkText(lines[lineIndex], MAX_VALUE_CHUNK)
      out.push(formatLine(level + 1, undefined, 'CONT', segmentChunks[0] ?? ''))
      for (let i = 1; i < segmentChunks.length; i += 1) {
        out.push(formatLine(level + 1, undefined, 'CONC', segmentChunks[i]))
      }
    }
  }

  for (const child of node.children) {
    serializeNode(child, level + 1, out)
  }
}

/** GedcomNode のツリーをGEDCOMテキストへシリアライズする。 */
export function serializeGedcomTree(roots: GedcomNode[]): string {
  const out: string[] = []
  for (const root of roots) {
    serializeNode(root, 0, out)
  }
  return out.join('\n') + '\n'
}

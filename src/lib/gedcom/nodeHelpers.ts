import type { GedcomNode } from '../../domain/gedcomNode'

export function findChild(
  node: GedcomNode,
  tag: string,
): GedcomNode | undefined {
  return node.children.find((child) => child.tag === tag)
}

export function findChildren(node: GedcomNode, tag: string): GedcomNode[] {
  return node.children.filter((child) => child.tag === tag)
}

export function findDescendantValue(
  node: GedcomNode,
  path: string[],
): string | undefined {
  let current: GedcomNode | undefined = node
  for (const tag of path) {
    current = current && findChild(current, tag)
    if (!current) {
      return undefined
    }
  }
  return current.value
}

/** xrefポインタ値(例: "@I1@")から中身のID("I1")を取り出す。 */
export function pointerToXref(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }
  const match = /^@([^@]+)@$/.exec(value.trim())
  return match?.[1]
}

export function xrefToPointer(xref: string): string {
  return `@${xref}@`
}

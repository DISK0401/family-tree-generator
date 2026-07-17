import { z } from 'zod'

/**
 * GEDCOMの汎用ツリー表現(構文層)。level/xref/tag/valueの解析結果を
 * 保持し、意味層(lib/gedcom)がPerson/Family/TreeDocumentへ変換する。
 */
export interface GedcomNode {
  tag: string
  value?: string
  xref?: string
  /** 構文解析時の元ファイルでの行番号(1始まり)。警告メッセージの提示に使う。 */
  lineNumber?: number
  children: GedcomNode[]
}

export const gedcomNodeSchema: z.ZodType<GedcomNode> = z.lazy(() =>
  z.object({
    tag: z.string(),
    value: z.string().optional(),
    xref: z.string().optional(),
    lineNumber: z.number().int().optional(),
    children: z.array(gedcomNodeSchema),
  }),
)

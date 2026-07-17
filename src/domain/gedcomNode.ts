import { z } from 'zod'

/**
 * GEDCOMの汎用ツリー表現。意味を解釈できないタグ・サブツリーを
 * Person/Family の保全領域(unmappedTags)にそのまま格納するために使う。
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

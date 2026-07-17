import { z } from 'zod'

/**
 * GEDCOMの汎用ツリー表現。意味を解釈できないタグ・サブツリーを
 * Person/Family の保全領域(unmappedTags)にそのまま格納するために使う。
 */
export interface GedcomNode {
  tag: string
  value?: string
  xref?: string
  children: GedcomNode[]
}

export const gedcomNodeSchema: z.ZodType<GedcomNode> = z.lazy(() =>
  z.object({
    tag: z.string(),
    value: z.string().optional(),
    xref: z.string().optional(),
    children: z.array(gedcomNodeSchema),
  }),
)

import { describe, expect, it } from 'vitest'
import {
  gedcomNodesToRelationshipType,
  relationshipTypeToGedcomNodes,
} from './relationshipMapping'

describe('relationshipTypeToGedcomNodes', () => {
  it('marriageはMARRイベントになる', () => {
    const result = relationshipTypeToGedcomNodes('marriage', '7.0')
    expect(result.nodes).toEqual([{ tag: 'MARR', children: [] }])
    expect(result.warnings).toHaveLength(0)
  })

  it('7.0の事実婚はEVEN/TYPEで警告なく出力される', () => {
    const result = relationshipTypeToGedcomNodes('defacto', '7.0')
    expect(result.nodes[0].tag).toBe('EVEN')
    expect(result.warnings).toHaveLength(0)
  })

  it('5.5.1の事実婚はNOTEで保全され警告が出る', () => {
    const result = relationshipTypeToGedcomNodes('defacto', '5.5.1')
    expect(result.nodes[0].tag).toBe('NOTE')
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('5.5.1では標準表現できない')
  })
})

describe('gedcomNodesToRelationshipType', () => {
  it('DIVがあれば離婚成立済みと判定する', () => {
    const type = gedcomNodesToRelationshipType({
      tag: 'FAM',
      children: [{ tag: 'DIV', children: [] }],
    })
    expect(type).toBe('divorced')
  })

  it('MARRのみならmarriageと判定する', () => {
    const type = gedcomNodesToRelationshipType({
      tag: 'FAM',
      children: [{ tag: 'MARR', children: [] }],
    })
    expect(type).toBe('marriage')
  })

  it('イベントが無ければunknownと判定する', () => {
    const type = gedcomNodesToRelationshipType({ tag: 'FAM', children: [] })
    expect(type).toBe('unknown')
  })
})

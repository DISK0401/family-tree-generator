import { describe, expect, it } from 'vitest'
import { createId } from '../../domain/id'
import type { FamilyTreeData } from '../../domain/model'
import { parseDateString } from '../wareki/parseDate'
import { exportFamilyTreeJson } from './export'

describe('exportFamilyTreeJson', () => {
  it('schemaVersionとexportedAtを含む', () => {
    const data: FamilyTreeData = { people: [], families: [] }
    const exported = exportFamilyTreeJson(data)

    expect(exported.schemaVersion).toBe(1)
    expect(typeof exported.exportedAt).toBe('string')
    expect(new Date(exported.exportedAt).toString()).not.toBe('Invalid Date')
  })

  it('別表記・和暦原文・保全タグを含む全情報をロスレスに出力する', () => {
    const person = {
      id: createId(),
      name: {
        family: '渡邊',
        given: '太郎',
        alternates: [{ family: '渡辺' }],
      },
      birth: { date: parseDateString('明治十年頃') },
      unmappedTags: [{ tag: '_MYTAG', value: 'x', children: [] }],
    }
    const data: FamilyTreeData = { people: [person], families: [] }

    const exported = exportFamilyTreeJson(data)

    expect(exported.people[0].name?.alternates?.[0].family).toBe('渡辺')
    expect(exported.people[0].birth?.date?.original).toBe('明治十年頃')
    expect(exported.people[0].unmappedTags?.[0].tag).toBe('_MYTAG')
  })
})

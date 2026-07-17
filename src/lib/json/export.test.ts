import { describe, expect, it } from 'vitest'
import { createTreeDocument } from '../../domain/helpers'
import { addPerson } from '../../domain/commands'
import { exportFamilyTreeJsonText } from './export'

describe('exportFamilyTreeJsonText', () => {
  it('schemaVersionを含むJSONを出力する', () => {
    const document = createTreeDocument()
    const text = exportFamilyTreeJsonText(document)
    const parsed = JSON.parse(text)

    expect(parsed.schemaVersion).toBe(document.schemaVersion)
    expect(typeof parsed.updatedAt).toBe('string')
  })

  it('ふりがな・メモを含む全情報をロスレスに出力する', () => {
    let document = createTreeDocument()
    const result = addPerson(document, {
      name: { surname: '渡邊', given: '太郎', surnameKana: 'わたなべ' },
      note: 'メモ',
    })
    document = result.doc

    const text = exportFamilyTreeJsonText(document)
    const parsed = JSON.parse(text)
    const person = parsed.persons[result.personId]

    expect(person.name.surname).toBe('渡邊')
    expect(person.name.surnameKana).toBe('わたなべ')
    expect(person.note).toBe('メモ')
  })
})

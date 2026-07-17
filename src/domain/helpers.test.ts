import { describe, expect, it } from 'vitest'
import {
  createFamily,
  createPerson,
  createTreeDocument,
  displayName,
  familyEventsInOrder,
} from './helpers'
import { SCHEMA_VERSION } from './types'

describe('createPerson', () => {
  it('名前のみで人物が成立し、他は不明のまま許容される', () => {
    const p = createPerson({ name: { given: '花子' } })
    expect(p.id).toBeTruthy()
    expect(p.gender).toBe('unknown')
    expect(p.birth).toBeUndefined()
    expect(p.death).toBeUndefined()
    expect(displayName(p)).toBe('花子')
  })

  it('旧字体・異体字を含む氏名が正規化されずそのまま保持される', () => {
    const p = createPerson({ name: { surname: '髙橋', given: '廣' } })
    expect(p.name.surname).toBe('髙橋')
    expect(p.name.given).toBe('廣')
    expect(displayName(p)).toBe('髙橋 廣')
  })

  it('ふりがなが姓・名それぞれに対応づけて保持される', () => {
    const p = createPerson({
      name: { surname: '東海林', given: '太郎', surnameKana: 'しょうじ', givenKana: 'たろう' },
    })
    expect(p.name.surnameKana).toBe('しょうじ')
    expect(p.name.givenKana).toBe('たろう')
  })
})

describe('createFamily', () => {
  it('配偶者1名のみ(ひとり親)でも家族が成立し、子を帰属させられる', () => {
    const parent = createPerson({ name: { given: '一郎' } })
    const child = createPerson({ name: { given: '二郎' } })
    const f = createFamily({
      spouseIds: [parent.id],
      children: [{ childId: child.id, pedigree: 'biological' }],
    })
    expect(f.spouseIds).toHaveLength(1)
    expect(f.children[0]).toEqual({ childId: child.id, pedigree: 'biological' })
  })

  it('婚姻イベントなし(事実婚)でも成立し種別が保持される', () => {
    const f = createFamily({ spouseIds: ['a', 'b'], kind: 'common-law' })
    expect(f.kind).toBe('common-law')
    expect(f.events).toEqual([])
  })
})

describe('familyEventsInOrder', () => {
  it('婚姻→離婚→再婚(復縁)のイベントが日付順で取得できる', () => {
    const f = createFamily({
      spouseIds: ['a', 'b'],
      events: [
        {
          type: 'marriage',
          date: { original: '平成10年', qualifier: 'exact', date: { year: 1998 } },
        },
        {
          type: 'marriage',
          date: { original: '昭和60年', qualifier: 'exact', date: { year: 1985 } },
        },
        {
          type: 'divorce',
          date: { original: '平成2年', qualifier: 'exact', date: { year: 1990 } },
        },
      ],
    })
    expect(familyEventsInOrder(f).map((e) => e.type)).toEqual(['marriage', 'divorce', 'marriage'])
  })

  it('日付なしイベントは末尾に置かれ、登録順が保たれる', () => {
    const f = createFamily({
      spouseIds: ['a', 'b'],
      events: [
        { type: 'divorce' },
        {
          type: 'marriage',
          date: { original: '2000', qualifier: 'exact', date: { year: 2000 } },
        },
      ],
    })
    expect(familyEventsInOrder(f).map((e) => e.type)).toEqual(['marriage', 'divorce'])
  })
})

describe('createTreeDocument', () => {
  it('現行schemaVersionが付与される', () => {
    const doc = createTreeDocument()
    expect(doc.schemaVersion).toBe(SCHEMA_VERSION)
    expect(doc.persons).toEqual({})
    expect(doc.families).toEqual({})
  })
})

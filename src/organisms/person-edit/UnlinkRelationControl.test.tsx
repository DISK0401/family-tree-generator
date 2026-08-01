import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  addChild,
  addFamilyEvent,
  addPerson,
  addSpouse,
  isUnconnectedPerson,
} from '../../domain/commands'
import { createTreeDocument } from '../../domain/helpers'
import { useTreeStore } from '../../store/tree-store'
import { FamilyEventEditor } from './FamilyEventEditor'
import { PedigreeEditor } from './PedigreeEditor'

let personAId = ''

beforeEach(() => {
  const a = addPerson(createTreeDocument(), { name: { given: 'A' } })
  personAId = a.personId
  useTreeStore.getState().replace(a.doc)
})

describe('PedigreeEditor: 親子関係の解除', () => {
  it('子として属する家族の数だけ解除操作が描画される', () => {
    let doc = useTreeStore.getState().document
    const c = addChild(doc, personAId, { name: { given: 'C' } })
    doc = c.doc
    // 養親側の家族にも子として帰属させる
    const adoptive = addPerson(doc, { name: { given: '養親' } })
    doc = adoptive.doc
    doc = addChild(doc, adoptive.personId, { name: { given: 'dummy' } }).doc
    useTreeStore.getState().replace(doc)

    render(<PedigreeEditor personId={c.childId} />)
    expect(
      screen.getAllByRole('button', { name: 'この親子関係を解除' }),
    ).toHaveLength(1)
  })

  it('承認すると親子関係だけが外れ、人物は残る', () => {
    let doc = useTreeStore.getState().document
    const b = addSpouse(doc, personAId, { name: { given: 'B' } })
    doc = b.doc
    const c = addChild(
      doc,
      personAId,
      { name: { given: 'C' } },
      { otherParentId: b.spouseId },
    )
    useTreeStore.getState().replace(c.doc)

    render(<PedigreeEditor personId={c.childId} />)
    fireEvent.click(screen.getByRole('button', { name: 'この親子関係を解除' }))
    fireEvent.click(screen.getByRole('button', { name: '解除する' }))

    const next = useTreeStore.getState().document
    expect(next.persons[c.childId]).toBeDefined()
    expect(next.families[b.familyId].children).toEqual([])
    expect(isUnconnectedPerson(next, c.childId)).toBe(true)
  })

  it('図から外れて一覧へ移る旨が示される', () => {
    const c = addChild(useTreeStore.getState().document, personAId, {
      name: { given: 'C' },
    })
    useTreeStore.getState().replace(c.doc)

    render(<PedigreeEditor personId={c.childId} />)
    fireEvent.click(screen.getByRole('button', { name: 'この親子関係を解除' }))

    expect(screen.getByRole('alertdialog').textContent).toContain(
      '図に現れていない人物',
    )
    expect(screen.getByRole('alertdialog').textContent).toContain(
      '人物そのものは削除されません',
    )
  })

  it('他にも関係が残る人物では、一覧へ移る旨は示されない', () => {
    let doc = useTreeStore.getState().document
    const c = addChild(doc, personAId, { name: { given: 'C' } })
    doc = c.doc
    // Cに配偶者を与えると、親子関係を外しても図から外れない
    doc = addSpouse(doc, c.childId, { name: { given: 'C配偶者' } }).doc
    useTreeStore.getState().replace(doc)

    render(<PedigreeEditor personId={c.childId} />)
    fireEvent.click(screen.getByRole('button', { name: 'この親子関係を解除' }))

    expect(screen.getByRole('alertdialog').textContent).not.toContain(
      '図に現れていない人物',
    )
  })

  it('キャンセルではドキュメントが変化しない', () => {
    const c = addChild(useTreeStore.getState().document, personAId, {
      name: { given: 'C' },
    })
    useTreeStore.getState().replace(c.doc)
    const before = useTreeStore.getState().document

    render(<PedigreeEditor personId={c.childId} />)
    fireEvent.click(screen.getByRole('button', { name: 'この親子関係を解除' }))
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))

    expect(useTreeStore.getState().document).toBe(before)
  })

  it('解除直後のundoで親子関係と家族が復元される', () => {
    const c = addChild(useTreeStore.getState().document, personAId, {
      name: { given: 'C' },
    })
    useTreeStore.getState().replace(c.doc)

    render(<PedigreeEditor personId={c.childId} />)
    fireEvent.click(screen.getByRole('button', { name: 'この親子関係を解除' }))
    fireEvent.click(screen.getByRole('button', { name: '解除する' }))
    // ひとり親の家族だったため家族ごと消える
    expect(
      useTreeStore.getState().document.families[c.familyId],
    ).toBeUndefined()

    useTreeStore.getState().undo()
    expect(
      useTreeStore.getState().document.families[c.familyId].children,
    ).toEqual([{ childId: c.childId, pedigree: 'biological' }])
  })
})

describe('FamilyEventEditor: 家族からの離脱', () => {
  it('婚姻単位の削除と並存し、それぞれ別の確認ダイアログを開く', () => {
    const b = addSpouse(useTreeStore.getState().document, personAId, {
      name: { given: 'B' },
    })
    useTreeStore.getState().replace(b.doc)

    render(<FamilyEventEditor personId={personAId} />)
    expect(
      screen.getByRole('button', { name: 'この家族から自分を外す' }),
    ).toBeDefined()
    expect(screen.getByRole('button', { name: 'この婚姻を削除' })).toBeDefined()

    fireEvent.click(
      screen.getByRole('button', { name: 'この家族から自分を外す' }),
    )
    expect(screen.getByRole('alertdialog').textContent).toContain(
      'この家族の配偶者から外れますか？',
    )
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))

    fireEvent.click(screen.getByRole('button', { name: 'この婚姻を削除' }))
    expect(screen.getByRole('alertdialog').textContent).toContain(
      'この婚姻を削除しますか？',
    )
  })

  it('子ありの家族では、ひとり親として存続し子の帰属が維持される', () => {
    let doc = useTreeStore.getState().document
    const b = addSpouse(doc, personAId, { name: { given: 'B' } })
    doc = b.doc
    const c = addChild(
      doc,
      personAId,
      { name: { given: 'C' } },
      { otherParentId: b.spouseId },
    )
    useTreeStore.getState().replace(c.doc)

    render(<FamilyEventEditor personId={b.spouseId} />)
    fireEvent.click(
      screen.getByRole('button', { name: 'この家族から自分を外す' }),
    )
    fireEvent.click(screen.getByRole('button', { name: '解除する' }))

    const next = useTreeStore.getState().document
    expect(next.families[b.familyId].spouseIds).toEqual([personAId])
    expect(next.families[b.familyId].children.map((x) => x.childId)).toEqual([
      c.childId,
    ])
    expect(next.persons[b.spouseId]).toBeDefined()
  })

  it('子なしの家族では、失われる婚姻の記録の件数が事前に示される', () => {
    let doc = useTreeStore.getState().document
    const b = addSpouse(doc, personAId, { name: { given: 'B' } })
    doc = addFamilyEvent(b.doc, b.familyId, {
      type: 'marriage',
      date: {
        original: '昭和47年11月7日',
        qualifier: 'exact',
        date: { year: 1972, month: 11, day: 7 },
      },
    })
    useTreeStore.getState().replace(doc)

    render(<FamilyEventEditor personId={b.spouseId} />)
    fireEvent.click(
      screen.getByRole('button', { name: 'この家族から自分を外す' }),
    )

    const text = screen.getByRole('alertdialog').textContent ?? ''
    expect(text).toContain('婚姻・離婚の記録1件')
    expect(text).toContain('人物そのものは削除されません')
    expect(text).toContain('元に戻す')
  })

  it('予告した家族削除の有無と実行結果が一致する', () => {
    const b = addSpouse(useTreeStore.getState().document, personAId, {
      name: { given: 'B' },
    })
    useTreeStore.getState().replace(b.doc)
    const familyCountBefore = Object.keys(
      useTreeStore.getState().document.families,
    ).length

    render(<FamilyEventEditor personId={b.spouseId} />)
    fireEvent.click(
      screen.getByRole('button', { name: 'この家族から自分を外す' }),
    )
    // 子なしのため家族ごと失われる旨が示される
    expect(screen.getByRole('alertdialog').textContent).toContain(
      '家族(婚姻の単位)そのもの',
    )
    fireEvent.click(screen.getByRole('button', { name: '解除する' }))

    const after = Object.keys(useTreeStore.getState().document.families).length
    expect(familyCountBefore - after).toBe(1)
  })
})

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { addPerson, addSpouse } from '../domain/commands'
import { createTreeDocument } from '../domain/helpers'
import { useTreeStore } from '../store/tree-store'
import { PersonPanel } from './PersonPanel'

let personAId = ''

beforeEach(() => {
  let doc = createTreeDocument()
  const a = addPerson(doc, { name: { given: 'A' } })
  doc = a.doc
  personAId = a.personId
  useTreeStore.getState().replace(doc)
})

describe('PersonPanel: 配偶者の追加', () => {
  it('配偶者を追加すると新しい人物とFamilyが作成される', () => {
    render(<PersonPanel personId={personAId} />)
    fireEvent.click(screen.getByRole('button', { name: '配偶者を追加' }))
    fireEvent.change(screen.getByLabelText('名'), { target: { value: 'B' } })
    fireEvent.click(screen.getByRole('button', { name: '追加する' }))

    const doc = useTreeStore.getState().document
    expect(Object.values(doc.persons)).toHaveLength(2)
    const family = Object.values(doc.families).find((f) => f.spouseIds.includes(personAId))
    expect(family?.spouseIds).toHaveLength(2)
  })

  it('再婚: 既に配偶者がいても新たな配偶者を追加でき、既存の家族は残る', () => {
    let doc = useTreeStore.getState().document
    const b = addSpouse(doc, personAId, { name: { given: 'B' } })
    doc = b.doc
    useTreeStore.getState().replace(doc)

    render(<PersonPanel personId={personAId} />)
    fireEvent.click(screen.getByRole('button', { name: '配偶者を追加' }))
    fireEvent.change(screen.getByLabelText('名'), { target: { value: 'C' } })
    fireEvent.click(screen.getByRole('button', { name: '追加する' }))

    const finalDoc = useTreeStore.getState().document
    const aFamilies = Object.values(finalDoc.families).filter((f) => f.spouseIds.includes(personAId))
    expect(aFamilies).toHaveLength(2)
    expect(aFamilies.some((f) => f.id === b.familyId)).toBe(true)
  })
})

describe('PersonPanel: 子の追加', () => {
  it('配偶者が1人のときは自動的に相方として子が帰属する', () => {
    let doc = useTreeStore.getState().document
    const b = addSpouse(doc, personAId, { name: { given: 'B' } })
    doc = b.doc
    useTreeStore.getState().replace(doc)

    render(<PersonPanel personId={personAId} />)
    fireEvent.click(screen.getByRole('button', { name: '子を追加' }))
    fireEvent.change(screen.getByLabelText('名'), { target: { value: 'C' } })
    fireEvent.click(screen.getByRole('button', { name: '追加する' }))

    const finalDoc = useTreeStore.getState().document
    const family = finalDoc.families[b.familyId]
    expect(family.children).toHaveLength(1)
    expect(family.children[0].pedigree).toBe('biological')
  })

  it('配偶者がいないときはひとり親家族へ子が帰属する', () => {
    render(<PersonPanel personId={personAId} />)
    fireEvent.click(screen.getByRole('button', { name: '子を追加' }))
    fireEvent.change(screen.getByLabelText('名'), { target: { value: 'C' } })
    fireEvent.click(screen.getByRole('button', { name: '追加する' }))

    const doc = useTreeStore.getState().document
    const family = Object.values(doc.families).find((f) => f.spouseIds.includes(personAId))
    expect(family?.spouseIds).toEqual([personAId])
    expect(family?.children).toHaveLength(1)
  })
})

describe('PersonPanel: 親の追加', () => {
  it('親未登録の人物に親を追加すると家族が新設される', () => {
    render(<PersonPanel personId={personAId} />)
    fireEvent.click(screen.getByRole('button', { name: '親を追加' }))
    fireEvent.change(screen.getByLabelText('名'), { target: { value: '親' } })
    fireEvent.click(screen.getByRole('button', { name: '追加する' }))

    const doc = useTreeStore.getState().document
    expect(Object.values(doc.persons)).toHaveLength(2)
    const family = Object.values(doc.families).find((f) =>
      f.children.some((c) => c.childId === personAId),
    )
    expect(family?.spouseIds).toHaveLength(1)
  })
})

describe('PersonPanel: フォームの開閉', () => {
  it('同じアクションを再度クリックするとフォームが閉じる', () => {
    render(<PersonPanel personId={personAId} />)
    fireEvent.click(screen.getByRole('button', { name: '配偶者を追加' }))
    expect(screen.getByLabelText('名')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '配偶者を追加' }))
    expect(screen.queryByLabelText('名')).not.toBeInTheDocument()
  })

  it('キャンセルでフォームが閉じ、データは変更されない', () => {
    render(<PersonPanel personId={personAId} />)
    fireEvent.click(screen.getByRole('button', { name: '配偶者を追加' }))
    fireEvent.change(screen.getByLabelText('名'), { target: { value: 'B' } })
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))

    expect(screen.queryByLabelText('名')).not.toBeInTheDocument()
    expect(Object.values(useTreeStore.getState().document.persons)).toHaveLength(1)
  })
})

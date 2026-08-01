import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  addChild,
  addPerson,
  addSpouse,
  setFamilyEvent,
} from '../../domain/commands'
import { createTreeDocument } from '../../domain/helpers'
import type { TreeDocument } from '../../domain/types'
import { useTreeStore } from '../../store/tree-store'
import { DeletePersonControl } from './DeletePersonControl'

function openDialog(doc: TreeDocument, personId: string) {
  useTreeStore.getState().replace(doc)
  render(<DeletePersonControl personId={personId} onDeleted={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: 'この人物を削除' }))
  return screen.getByRole('alertdialog')
}

describe('DeletePersonControl: 削除で失われる内容の提示', () => {
  it('家族ごと削除される場合、婚姻・離婚の記録も失われる旨が示される', () => {
    let doc = createTreeDocument()
    const a = addPerson(doc, { name: { given: 'A' } })
    doc = a.doc
    const spouse = addSpouse(doc, a.personId, { name: { given: 'B' } })
    doc = setFamilyEvent(spouse.doc, spouse.familyId, 'marriage', {
      type: 'marriage',
      place: '東京都江戸川区',
    })

    // 子がいない夫婦なので、Bの削除で家族ごと消える
    const dialog = openDialog(doc, spouse.spouseId)
    expect(dialog).toHaveTextContent('婚姻・離婚の記録1件も失われます')
    expect(dialog).toHaveTextContent('「元に戻す」で復元できます')
  })

  it('家族が削除されない場合は婚姻・離婚の記録の警告を出さない', () => {
    let doc = createTreeDocument()
    const a = addPerson(doc, { name: { given: 'A' } })
    doc = a.doc
    const spouse = addSpouse(doc, a.personId, { name: { given: 'B' } })
    doc = setFamilyEvent(spouse.doc, spouse.familyId, 'marriage', {
      type: 'marriage',
    })
    // 子がいるため家族はひとり親家族として残り、婚姻の記録も残る
    doc = addChild(
      doc,
      a.personId,
      { name: { given: 'C' } },
      {
        otherParentId: spouse.spouseId,
      },
    ).doc

    const dialog = openDialog(doc, spouse.spouseId)
    expect(dialog).toHaveTextContent('配偶者とのつながり1件')
    expect(dialog).not.toHaveTextContent('失われます')
  })

  it('関係のない人物では従来どおり関係なしと表示される', () => {
    let doc = createTreeDocument()
    const a = addPerson(doc, { name: { given: 'A' } })
    doc = a.doc

    const dialog = openDialog(doc, a.personId)
    expect(dialog).toHaveTextContent('他の人物との関係はありません。')
    expect(dialog).not.toHaveTextContent('失われます')
  })
})

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { addFamilyEvent, addPerson, addSpouse } from '../domain/commands'
import { createTreeDocument } from '../domain/helpers'
import { useTreeStore } from '../store/tree-store'
import { FamilyEventEditor } from './FamilyEventEditor'

let personAId = ''
let familyId = ''

beforeEach(() => {
  let doc = createTreeDocument()
  const a = addPerson(doc, { name: { given: 'A' } })
  doc = a.doc
  personAId = a.personId
  const spouse = addSpouse(doc, personAId, { name: { given: 'B' } })
  doc = spouse.doc
  familyId = spouse.familyId
  useTreeStore.getState().replace(doc)
})

describe('FamilyEventEditor: 婚姻日・離婚日の設定', () => {
  it('婚姻日を入力してフォーカスを外すと、確定操作なしにデータモデルへ反映される', () => {
    render(<FamilyEventEditor personId={personAId} />)
    expect(screen.queryByRole('button', { name: '確定' })).not.toBeInTheDocument()

    const input = screen.getByLabelText('婚姻日')
    fireEvent.change(input, { target: { value: '昭和50年4月1日' } })
    fireEvent.blur(input)

    const family = useTreeStore.getState().document.families[familyId]
    const marriage = family.events.find((e) => e.type === 'marriage')
    expect(marriage?.date?.date).toEqual({ year: 1975, month: 4, day: 1 })
  })

  it('離婚日を入力してフォーカスを外すと反映される', () => {
    render(<FamilyEventEditor personId={personAId} />)
    const input = screen.getByLabelText('離婚日')
    fireEvent.change(input, { target: { value: '2000-01-01' } })
    fireEvent.blur(input)

    const family = useTreeStore.getState().document.families[familyId]
    const divorce = family.events.find((e) => e.type === 'divorce')
    expect(divorce?.date?.date).toEqual({ year: 2000, month: 1, day: 1 })
  })

  it('日付欄を空にしてフォーカスを外すと、そのイベントが削除される(他のイベントは影響を受けない)', () => {
    let doc = useTreeStore.getState().document
    doc = addFamilyEvent(doc, familyId, {
      type: 'marriage',
      date: { original: '1975-04-01', qualifier: 'exact', date: { year: 1975, month: 4, day: 1 } },
    })
    doc = addFamilyEvent(doc, familyId, {
      type: 'divorce',
      date: { original: '2000-01-01', qualifier: 'exact', date: { year: 2000, month: 1, day: 1 } },
    })
    useTreeStore.getState().replace(doc)

    render(<FamilyEventEditor personId={personAId} />)
    const marriageInput = screen.getByLabelText('婚姻日')
    fireEvent.change(marriageInput, { target: { value: '' } })
    fireEvent.blur(marriageInput)

    const family = useTreeStore.getState().document.families[familyId]
    expect(family.events.find((e) => e.type === 'marriage')).toBeUndefined()
    expect(family.events.find((e) => e.type === 'divorce')).toBeDefined()
  })
})

describe('FamilyEventEditor: 複数配偶者を持つ人物の編集', () => {
  it('家族ごとに独立して編集でき、一方の変更は他方に影響しない', () => {
    let doc = useTreeStore.getState().document
    const second = addSpouse(doc, personAId, { name: { given: 'C' } })
    doc = second.doc
    useTreeStore.getState().replace(doc)

    render(<FamilyEventEditor personId={personAId} />)
    const marriageInputs = screen.getAllByLabelText('婚姻日')
    expect(marriageInputs).toHaveLength(2)

    fireEvent.change(marriageInputs[0], { target: { value: '1990-01-01' } })
    fireEvent.blur(marriageInputs[0])

    const finalDoc = useTreeStore.getState().document
    const firstFamily = finalDoc.families[familyId]
    const secondFamily = finalDoc.families[second.familyId]
    expect(firstFamily.events.find((e) => e.type === 'marriage')).toBeDefined()
    expect(secondFamily.events.find((e) => e.type === 'marriage')).toBeUndefined()
  })
})

describe('FamilyEventEditor: 復縁(3件以上のイベント)', () => {
  it('種別ごとに最初の1件のみが編集対象になり、他に件数がある旨の注記が表示される', () => {
    let doc = useTreeStore.getState().document
    doc = addFamilyEvent(doc, familyId, {
      type: 'marriage',
      date: { original: '1975-04-01', qualifier: 'exact', date: { year: 1975, month: 4, day: 1 } },
    })
    doc = addFamilyEvent(doc, familyId, { type: 'divorce' })
    doc = addFamilyEvent(doc, familyId, {
      type: 'marriage',
      date: { original: '2000-01-01', qualifier: 'exact', date: { year: 2000, month: 1, day: 1 } },
    })
    useTreeStore.getState().replace(doc)

    render(<FamilyEventEditor personId={personAId} />)
    // 最初の婚姻イベント(1975年)が編集欄に表示される
    expect(screen.getByLabelText('婚姻日')).toHaveValue('1975-04-01')
    expect(screen.getByText(/他に1件の婚姻日イベントがあります/)).toBeInTheDocument()

    // 他フィールドを編集して保存しても、2件目の婚姻イベントは失われない
    const placeInputs = screen.getAllByLabelText('場所')
    fireEvent.change(placeInputs[0], { target: { value: '東京都' } })
    fireEvent.blur(placeInputs[0])

    const family = useTreeStore.getState().document.families[familyId]
    const marriageEvents = family.events.filter((e) => e.type === 'marriage')
    expect(marriageEvents).toHaveLength(2)
    expect(marriageEvents[1].date?.date).toEqual({ year: 2000, month: 1, day: 1 })
  })
})

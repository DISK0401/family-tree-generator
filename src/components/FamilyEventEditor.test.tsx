import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  addChild,
  addFamilyEvent,
  addParent,
  addPerson,
  addSpouse,
} from '../domain/commands'
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
    expect(
      screen.queryByRole('button', { name: '確定' }),
    ).not.toBeInTheDocument()

    const input = screen.getByLabelText('婚姻日')
    fireEvent.change(input, { target: { value: '昭和50年4月1日' } })
    fireEvent.blur(input)

    const family = useTreeStore.getState().document.families[familyId]
    const marriage = family.events.find((e) => e.type === 'marriage')
    expect(marriage?.date?.date).toEqual({ year: 1975, month: 4, day: 1 })
  })

  it('婚姻日を入力してEnterキーを押すと、フォーカスを外さなくてもデータモデルへ反映される', () => {
    render(<FamilyEventEditor personId={personAId} />)
    const input = screen.getByLabelText('婚姻日')
    fireEvent.change(input, { target: { value: '20100401' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    const family = useTreeStore.getState().document.families[familyId]
    const marriage = family.events.find((e) => e.type === 'marriage')
    expect(marriage?.date?.date).toEqual({ year: 2010, month: 4, day: 1 })
  })

  it('入力してもフォーカスを外さずEnterも押さない間は反映されない(即時反映はblur/Enterが契機であることの確認)', () => {
    render(<FamilyEventEditor personId={personAId} />)
    const input = screen.getByLabelText('婚姻日')
    fireEvent.change(input, { target: { value: '20100401' } })

    const family = useTreeStore.getState().document.families[familyId]
    expect(family.events.find((e) => e.type === 'marriage')).toBeUndefined()
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
      date: {
        original: '1975-04-01',
        qualifier: 'exact',
        date: { year: 1975, month: 4, day: 1 },
      },
    })
    doc = addFamilyEvent(doc, familyId, {
      type: 'divorce',
      date: {
        original: '2000-01-01',
        qualifier: 'exact',
        date: { year: 2000, month: 1, day: 1 },
      },
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

describe('FamilyEventEditor: 無変更commitのスキップとフォーカス移動(監査 高2)', () => {
  it('何も変えずにフォーカスを外しても履歴(past)が積まれない', () => {
    render(<FamilyEventEditor personId={personAId} />)
    const input = screen.getByLabelText('婚姻日')

    fireEvent.focus(input)
    fireEvent.blur(input)

    expect(useTreeStore.getState().past).toHaveLength(0)
    expect(
      useTreeStore.getState().document.families[familyId].events,
    ).toHaveLength(0)
  })

  it('既存イベントがある状態でも、無変更のフォーカス通過では履歴が積まれない', () => {
    let doc = useTreeStore.getState().document
    doc = addFamilyEvent(doc, familyId, {
      type: 'marriage',
      date: {
        original: '1975-04-01',
        qualifier: 'exact',
        date: { year: 1975, month: 4, day: 1 },
      },
    })
    useTreeStore.getState().replace(doc)

    render(<FamilyEventEditor personId={personAId} />)
    const input = screen.getByLabelText('婚姻日')
    fireEvent.focus(input)
    fireEvent.blur(input)

    expect(useTreeStore.getState().past).toHaveLength(0)
  })

  it('日付を入力してfieldset内の場所欄へ移動した時点ではcommitされず、fieldsetの外へ出るとcommitされる', () => {
    render(<FamilyEventEditor personId={personAId} />)
    const input = screen.getByLabelText('婚姻日')
    const placeInput = screen.getAllByLabelText('場所')[0]

    fireEvent.change(input, { target: { value: '2010-04-01' } })
    // fieldset内のフォーカス移動(日付→場所へのTab)
    fireEvent.blur(input, { relatedTarget: placeInput })

    expect(
      useTreeStore.getState().document.families[familyId].events,
    ).toHaveLength(0)

    // fieldsetの外へフォーカスが出た時点でcommitされる
    fireEvent.blur(placeInput)

    const marriage = useTreeStore
      .getState()
      .document.families[familyId].events.find((e) => e.type === 'marriage')
    expect(marriage?.date?.date).toEqual({ year: 2010, month: 4, day: 1 })
    // commitは1回分の履歴だけを積む
    expect(useTreeStore.getState().past).toHaveLength(1)
  })

  it('undoでイベントが巻き戻ると、再マウントに依らず入力欄の表示へ反映される', () => {
    render(<FamilyEventEditor personId={personAId} />)
    const input = screen.getByLabelText('婚姻日')

    fireEvent.change(input, { target: { value: '2010-04-01' } })
    fireEvent.blur(input)
    expect(input).toHaveValue('2010-04-01')

    act(() => {
      useTreeStore.getState().undo()
    })

    // 同じinput要素(再マウントされていない)の表示が空へ戻る
    expect(input).toHaveValue('')
    expect(
      useTreeStore.getState().document.families[familyId].events,
    ).toHaveLength(0)
  })

  it('redoで再適用された値も入力欄へ反映される', () => {
    render(<FamilyEventEditor personId={personAId} />)
    const input = screen.getByLabelText('婚姻日')

    fireEvent.change(input, { target: { value: '2010-04-01' } })
    fireEvent.blur(input)
    act(() => {
      useTreeStore.getState().undo()
    })
    expect(input).toHaveValue('')

    act(() => {
      useTreeStore.getState().redo()
    })

    expect(input).toHaveValue('2010-04-01')
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
    expect(
      secondFamily.events.find((e) => e.type === 'marriage'),
    ).toBeUndefined()
  })
})

describe('FamilyEventEditor: 復縁(3件以上のイベント)', () => {
  it('種別ごとに最初の1件のみが編集対象になり、他に件数がある旨の注記が表示される', () => {
    let doc = useTreeStore.getState().document
    doc = addFamilyEvent(doc, familyId, {
      type: 'marriage',
      date: {
        original: '1975-04-01',
        qualifier: 'exact',
        date: { year: 1975, month: 4, day: 1 },
      },
    })
    doc = addFamilyEvent(doc, familyId, { type: 'divorce' })
    doc = addFamilyEvent(doc, familyId, {
      type: 'marriage',
      date: {
        original: '2000-01-01',
        qualifier: 'exact',
        date: { year: 2000, month: 1, day: 1 },
      },
    })
    useTreeStore.getState().replace(doc)

    render(<FamilyEventEditor personId={personAId} />)
    // 最初の婚姻イベント(1975年)が編集欄に表示される
    expect(screen.getByLabelText('婚姻日')).toHaveValue('1975-04-01')
    expect(
      screen.getByText(/他に1件の婚姻日イベントがあります/),
    ).toBeInTheDocument()

    // 他フィールドを編集して保存しても、2件目の婚姻イベントは失われない
    const placeInputs = screen.getAllByLabelText('場所')
    fireEvent.change(placeInputs[0], { target: { value: '東京都' } })
    fireEvent.blur(placeInputs[0])

    const family = useTreeStore.getState().document.families[familyId]
    const marriageEvents = family.events.filter((e) => e.type === 'marriage')
    expect(marriageEvents).toHaveLength(2)
    expect(marriageEvents[1].date?.date).toEqual({
      year: 2000,
      month: 1,
      day: 1,
    })
  })
})

describe('FamilyEventEditor: 婚姻単位の削除', () => {
  it('配偶者として属する家族の数だけ削除ボタンが描画される', () => {
    // Aに2つ目の家族(再婚)を追加する
    const doc = addSpouse(useTreeStore.getState().document, personAId, {
      name: { given: 'C' },
    }).doc
    useTreeStore.getState().replace(doc)

    render(<FamilyEventEditor personId={personAId} />)
    expect(
      screen.getAllByRole('button', { name: 'この婚姻を削除' }),
    ).toHaveLength(2)
  })

  it('確認ダイアログに失われる婚姻の記録と子の帰属の件数が示される', () => {
    let doc = addFamilyEvent(useTreeStore.getState().document, familyId, {
      type: 'marriage',
    })
    const spouseId = doc.families[familyId].spouseIds.find(
      (id) => id !== personAId,
    )!
    doc = addChild(
      doc,
      personAId,
      { name: { given: 'C1' } },
      { otherParentId: spouseId },
    ).doc
    doc = addChild(
      doc,
      personAId,
      { name: { given: 'C2' } },
      { otherParentId: spouseId },
    ).doc
    useTreeStore.getState().replace(doc)

    render(<FamilyEventEditor personId={personAId} />)
    fireEvent.click(screen.getByRole('button', { name: 'この婚姻を削除' }))

    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveTextContent('婚姻・離婚の記録1件')
    expect(dialog).toHaveTextContent('子2人の親としての帰属')
    expect(dialog).toHaveTextContent('人物そのものは削除されません')
  })

  it('承認すると家族が削除され、人物は削除されない', () => {
    render(<FamilyEventEditor personId={personAId} />)
    fireEvent.click(screen.getByRole('button', { name: 'この婚姻を削除' }))
    fireEvent.click(screen.getByRole('button', { name: '削除する' }))

    const state = useTreeStore.getState()
    expect(state.document.families[familyId]).toBeUndefined()
    expect(state.document.persons[personAId]).toBeDefined()
  })

  it('キャンセルするとドキュメントは変化しない', () => {
    const before = useTreeStore.getState().document
    render(<FamilyEventEditor personId={personAId} />)
    fireEvent.click(screen.getByRole('button', { name: 'この婚姻を削除' }))
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))

    expect(useTreeStore.getState().document).toBe(before)
  })

  it('削除直後のundoで家族・イベント・子の帰属が復元される', () => {
    let doc = addFamilyEvent(useTreeStore.getState().document, familyId, {
      type: 'marriage',
    })
    const spouseId = doc.families[familyId].spouseIds.find(
      (id) => id !== personAId,
    )!
    doc = addChild(
      doc,
      personAId,
      { name: { given: 'C1' } },
      { otherParentId: spouseId },
    ).doc
    useTreeStore.getState().replace(doc)
    const before = useTreeStore.getState().document.families[familyId]

    render(<FamilyEventEditor personId={personAId} />)
    fireEvent.click(screen.getByRole('button', { name: 'この婚姻を削除' }))
    fireEvent.click(screen.getByRole('button', { name: '削除する' }))
    useTreeStore.getState().undo()

    expect(useTreeStore.getState().document.families[familyId]).toEqual(before)
  })
})

describe('FamilyEventEditor: 配偶者が未登録の家族への紐づけ', () => {
  /** 子Cに親Pを登録した「配偶者未登録」の家族と、無関係な人物X・Yを用意する */
  function setupSpouselessFamily() {
    let doc = createTreeDocument()
    const c = addPerson(doc, { name: { given: 'C' } })
    doc = c.doc
    const parent = addParent(doc, c.personId, { name: { given: 'P' } })
    doc = parent.doc
    const x = addPerson(doc, { name: { given: 'X' } })
    doc = x.doc
    const y = addPerson(doc, { name: { given: 'Y' } })
    doc = y.doc
    useTreeStore.getState().replace(doc)
    return {
      childId: c.personId,
      parentId: parent.parentId,
      familyId: parent.familyId,
      xId: x.personId,
      yId: y.personId,
    }
  }

  it('配偶者が登録済みの家族には選択欄が出ない', () => {
    render(<FamilyEventEditor personId={personAId} />)
    expect(
      screen.queryByLabelText('配偶者に既存の人物を設定'),
    ).not.toBeInTheDocument()
  })

  it('配偶者が未登録の家族には選択欄が出る', () => {
    const { parentId } = setupSpouselessFamily()
    render(<FamilyEventEditor personId={parentId} />)
    expect(
      screen.getByLabelText('配偶者に既存の人物を設定'),
    ).toBeInTheDocument()
  })

  it('候補から自分自身とその家族の子が除外される', () => {
    const { parentId } = setupSpouselessFamily()
    render(<FamilyEventEditor personId={parentId} />)

    // キーワード絞り込み欄(PersonPicker)はフォーカスするまで候補一覧を開かない
    fireEvent.focus(screen.getByLabelText('配偶者に既存の人物を設定'))
    const options = screen.getAllByRole('option').map((o) => o.textContent)
    expect(options.sort()).toEqual(['X', 'Y'].sort())
  })

  it('氏名で絞り込める', () => {
    const { parentId } = setupSpouselessFamily()
    render(<FamilyEventEditor personId={parentId} />)

    fireEvent.change(screen.getByLabelText('配偶者に既存の人物を設定'), {
      target: { value: 'X' },
    })

    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'X',
    ])
  })

  it('候補を選ぶと確定操作なしで配偶者として反映される', () => {
    const {
      parentId,
      familyId: spouselessFamilyId,
      xId,
      childId,
    } = setupSpouselessFamily()
    render(<FamilyEventEditor personId={parentId} />)

    fireEvent.change(screen.getByLabelText('配偶者に既存の人物を設定'), {
      target: { value: 'X' },
    })
    fireEvent.click(screen.getByRole('option', { name: 'X' }))

    const family = useTreeStore.getState().document.families[spouselessFamilyId]
    expect(family.spouseIds).toEqual([parentId, xId])
    // 子の帰属は維持される
    expect(family.children.map((c) => c.childId)).toEqual([childId])
    // 見出しが選んだ人物の氏名に変わり、選択欄は消える
    expect(screen.getByText('X')).toBeInTheDocument()
    expect(
      screen.queryByLabelText('配偶者に既存の人物を設定'),
    ).not.toBeInTheDocument()
  })

  it('紐づけ直後のundoで配偶者未登録の状態へ戻る', () => {
    const {
      parentId,
      familyId: spouselessFamilyId,
      xId,
    } = setupSpouselessFamily()
    render(<FamilyEventEditor personId={parentId} />)

    fireEvent.change(screen.getByLabelText('配偶者に既存の人物を設定'), {
      target: { value: 'X' },
    })
    fireEvent.click(screen.getByRole('option', { name: 'X' }))
    expect(
      useTreeStore.getState().document.families[spouselessFamilyId].spouseIds,
    ).toEqual([parentId, xId])

    useTreeStore.getState().undo()

    expect(
      useTreeStore.getState().document.families[spouselessFamilyId].spouseIds,
    ).toEqual([parentId])
  })
})

describe('FamilyEventEditor: 分裂した家族の統合', () => {
  /**
   * 親子関係と婚姻関係が別々の家族に分かれ、双方に子がいる状態
   * (子Cは配偶者未登録の家族、子DはP・Qの家族)
   */
  function splitFamilies() {
    let doc = createTreeDocument()
    const c = addPerson(doc, { name: { given: 'C' } })
    doc = c.doc
    const parent = addParent(doc, c.personId, { name: { given: 'P' } })
    doc = parent.doc
    const q = addSpouse(doc, parent.parentId, { name: { given: 'Q' } })
    doc = q.doc
    const d = addChild(
      doc,
      parent.parentId,
      { name: { given: 'D' } },
      {
        otherParentId: q.spouseId,
      },
    )
    useTreeStore.getState().replace(d.doc)
    return {
      childCId: c.personId,
      childDId: d.childId,
      parentId: parent.parentId,
      spouselessFamilyId: parent.familyId,
      coupleFamilyId: q.familyId,
      qId: q.spouseId,
    }
  }

  it('配偶者未登録の枠で既存の配偶者を選ぶと、2つの枠が1つにまとまる', () => {
    const {
      parentId,
      qId,
      childCId,
      childDId,
      spouselessFamilyId,
      coupleFamilyId,
    } = splitFamilies()
    render(<FamilyEventEditor personId={parentId} />)
    // 統合前は「(配偶者未登録)」とQの2つの枠が並ぶ
    expect(screen.getByText('(配偶者未登録)')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('配偶者に既存の人物を設定'), {
      target: { value: 'Q' },
    })
    fireEvent.click(screen.getByRole('option', { name: 'Q' }))

    const doc = useTreeStore.getState().document
    expect(doc.families[spouselessFamilyId]).toBeUndefined()
    expect(doc.families[coupleFamilyId].spouseIds).toEqual([parentId, qId])
    // 双方の家族の子が1つの家族へ集まり、どちらも親を失わない
    expect(
      doc.families[coupleFamilyId].children.map((c) => c.childId).sort(),
    ).toEqual([childCId, childDId].sort())
    expect(screen.queryByText('(配偶者未登録)')).not.toBeInTheDocument()
  })

  it('統合直後のundoで2つの家族と子の帰属が復元される', () => {
    const { parentId, childCId, childDId, spouselessFamilyId, coupleFamilyId } =
      splitFamilies()
    render(<FamilyEventEditor personId={parentId} />)

    fireEvent.change(screen.getByLabelText('配偶者に既存の人物を設定'), {
      target: { value: 'Q' },
    })
    fireEvent.click(screen.getByRole('option', { name: 'Q' }))
    useTreeStore.getState().undo()

    const doc = useTreeStore.getState().document
    expect(
      doc.families[spouselessFamilyId].children.map((c) => c.childId),
    ).toEqual([childCId])
    expect(doc.families[coupleFamilyId].children.map((c) => c.childId)).toEqual(
      [childDId],
    )
  })
})

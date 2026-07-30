import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addChild, addParent, addPerson, addSpouse } from '../domain/commands'
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

/** 編集フォームとコンテキストアクションの追加フォームは同じラベル("姓"/"名")を使うため、
 * コンテキストアクション(パネル上部)を開いた際の1つ目の出現を対象人物追加用の入力として扱う */
function relationFormGivenInput() {
  return screen.getAllByLabelText('名')[0]
}

describe('PersonPanel: 配偶者の追加', () => {
  it('配偶者を追加すると新しい人物とFamilyが作成される', () => {
    render(
      <PersonPanel
        personId={personAId}
        onDeleted={() => {}}
        onClose={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '配偶者を追加' }))
    fireEvent.change(relationFormGivenInput(), { target: { value: 'B' } })
    fireEvent.click(screen.getByRole('button', { name: '追加する' }))

    const doc = useTreeStore.getState().document
    expect(Object.values(doc.persons)).toHaveLength(2)
    const family = Object.values(doc.families).find((f) =>
      f.spouseIds.includes(personAId),
    )
    expect(family?.spouseIds).toHaveLength(2)
  })

  it('再婚: 既に配偶者がいても新たな配偶者を追加でき、既存の家族は残る', () => {
    let doc = useTreeStore.getState().document
    const b = addSpouse(doc, personAId, { name: { given: 'B' } })
    doc = b.doc
    useTreeStore.getState().replace(doc)

    render(
      <PersonPanel
        personId={personAId}
        onDeleted={() => {}}
        onClose={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '配偶者を追加' }))
    fireEvent.change(relationFormGivenInput(), { target: { value: 'C' } })
    fireEvent.click(screen.getByRole('button', { name: '追加する' }))

    const finalDoc = useTreeStore.getState().document
    const aFamilies = Object.values(finalDoc.families).filter((f) =>
      f.spouseIds.includes(personAId),
    )
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

    render(
      <PersonPanel
        personId={personAId}
        onDeleted={() => {}}
        onClose={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '子を追加' }))
    fireEvent.change(relationFormGivenInput(), { target: { value: 'C' } })
    fireEvent.click(screen.getByRole('button', { name: '追加する' }))

    const finalDoc = useTreeStore.getState().document
    const family = finalDoc.families[b.familyId]
    expect(family.children).toHaveLength(1)
    expect(family.children[0].pedigree).toBe('biological')
  })

  it('配偶者がいないときはひとり親家族へ子が帰属する', () => {
    render(
      <PersonPanel
        personId={personAId}
        onDeleted={() => {}}
        onClose={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '子を追加' }))
    fireEvent.change(relationFormGivenInput(), { target: { value: 'C' } })
    fireEvent.click(screen.getByRole('button', { name: '追加する' }))

    const doc = useTreeStore.getState().document
    const family = Object.values(doc.families).find((f) =>
      f.spouseIds.includes(personAId),
    )
    expect(family?.spouseIds).toEqual([personAId])
    expect(family?.children).toHaveLength(1)
  })
})

describe('PersonPanel: 親の追加', () => {
  it('親未登録の人物に親を追加すると家族が新設される', () => {
    render(
      <PersonPanel
        personId={personAId}
        onDeleted={() => {}}
        onClose={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '親を追加' }))
    fireEvent.change(relationFormGivenInput(), { target: { value: '親' } })
    fireEvent.click(screen.getByRole('button', { name: '追加する' }))

    const doc = useTreeStore.getState().document
    expect(Object.values(doc.persons)).toHaveLength(2)
    const family = Object.values(doc.families).find((f) =>
      f.children.some((c) => c.childId === personAId),
    )
    expect(family?.spouseIds).toHaveLength(1)
  })
})

describe('PersonPanel: 新規作成した人物への自動フォーカス', () => {
  it('配偶者を追加すると、新規人物のIDでonPersonCreatedが呼ばれる', () => {
    const onPersonCreated = vi.fn()
    render(
      <PersonPanel
        personId={personAId}
        onDeleted={() => {}}
        onClose={() => {}}
        onPersonCreated={onPersonCreated}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '配偶者を追加' }))
    fireEvent.change(relationFormGivenInput(), { target: { value: 'B' } })
    fireEvent.click(screen.getByRole('button', { name: '追加する' }))

    const doc = useTreeStore.getState().document
    const created = Object.values(doc.persons).find((p) => p.id !== personAId)
    expect(onPersonCreated).toHaveBeenCalledTimes(1)
    expect(onPersonCreated).toHaveBeenCalledWith(created?.id)
  })

  it('子を追加すると、新規人物のIDでonPersonCreatedが呼ばれる', () => {
    const onPersonCreated = vi.fn()
    render(
      <PersonPanel
        personId={personAId}
        onDeleted={() => {}}
        onClose={() => {}}
        onPersonCreated={onPersonCreated}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '子を追加' }))
    fireEvent.change(relationFormGivenInput(), { target: { value: 'C' } })
    fireEvent.click(screen.getByRole('button', { name: '追加する' }))

    const doc = useTreeStore.getState().document
    const created = Object.values(doc.persons).find((p) => p.id !== personAId)
    expect(onPersonCreated).toHaveBeenCalledTimes(1)
    expect(onPersonCreated).toHaveBeenCalledWith(created?.id)
  })

  it('親を追加すると、新規人物のIDでonPersonCreatedが呼ばれる', () => {
    const onPersonCreated = vi.fn()
    render(
      <PersonPanel
        personId={personAId}
        onDeleted={() => {}}
        onClose={() => {}}
        onPersonCreated={onPersonCreated}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '親を追加' }))
    fireEvent.change(relationFormGivenInput(), { target: { value: '親' } })
    fireEvent.click(screen.getByRole('button', { name: '追加する' }))

    const doc = useTreeStore.getState().document
    const created = Object.values(doc.persons).find((p) => p.id !== personAId)
    expect(onPersonCreated).toHaveBeenCalledTimes(1)
    expect(onPersonCreated).toHaveBeenCalledWith(created?.id)
  })

  it('既存の人物を関係先として選んだ場合はonPersonCreatedが呼ばれない', () => {
    let doc = useTreeStore.getState().document
    const q = addPerson(doc, { name: { given: 'Q' } })
    doc = q.doc
    useTreeStore.getState().replace(doc)

    const onPersonCreated = vi.fn()
    render(
      <PersonPanel
        personId={personAId}
        onDeleted={() => {}}
        onClose={() => {}}
        onPersonCreated={onPersonCreated}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '配偶者を追加' }))
    fireEvent.click(screen.getByRole('button', { name: '既存の人物から選ぶ' }))
    const existingInput = screen.getByLabelText('既存の人物と新しい婚姻を作る')
    fireEvent.change(existingInput, { target: { value: 'Q' } })
    fireEvent.click(
      within(screen.getByRole('listbox')).getByRole('option', { name: 'Q' }),
    )

    expect(onPersonCreated).not.toHaveBeenCalled()
  })
})

describe('PersonPanel: フォームの開閉', () => {
  it('同じアクションを再度クリックするとフォームが閉じる', () => {
    render(
      <PersonPanel
        personId={personAId}
        onDeleted={() => {}}
        onClose={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '配偶者を追加' }))
    expect(screen.getAllByLabelText('名')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: '配偶者を追加' }))
    expect(screen.getAllByLabelText('名')).toHaveLength(1)
  })

  it('キャンセルでフォームが閉じ、データは変更されない', () => {
    render(
      <PersonPanel
        personId={personAId}
        onDeleted={() => {}}
        onClose={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '配偶者を追加' }))
    fireEvent.change(relationFormGivenInput(), { target: { value: 'B' } })
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))

    expect(screen.getAllByLabelText('名')).toHaveLength(1)
    expect(
      Object.values(useTreeStore.getState().document.persons),
    ).toHaveLength(1)
  })

  it('閉じるボタンでonCloseが呼ばれる(狭幅画面でパネルから図に戻る手段)', () => {
    const onClose = vi.fn()
    render(
      <PersonPanel
        personId={personAId}
        onDeleted={() => {}}
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'パネルを閉じる' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('PersonPanel: 編集フォーム', () => {
  it('選択時にサイドパネルの編集フォームが開く', () => {
    render(
      <PersonPanel
        personId={personAId}
        onDeleted={() => {}}
        onClose={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: '確定' })).toBeInTheDocument()
  })

  it('氏名を変更して確定するとデータモデルへ反映される', () => {
    render(
      <PersonPanel
        personId={personAId}
        onDeleted={() => {}}
        onClose={() => {}}
      />,
    )
    const givenInput = screen.getAllByLabelText('名')[0]
    fireEvent.change(givenInput, { target: { value: '次郎' } })
    fireEvent.click(screen.getByRole('button', { name: '確定' }))

    expect(useTreeStore.getState().document.persons[personAId].name.given).toBe(
      '次郎',
    )
  })
})

describe('PersonPanel: 続柄の編集', () => {
  it('実子から養子への変更がデータモデルへ反映される', () => {
    let doc = useTreeStore.getState().document
    const b = addPerson(doc, { name: { given: 'B' } })
    doc = b.doc
    const c = addChild(
      doc,
      personAId,
      { name: { given: 'C' } },
      { otherParentId: b.personId },
    )
    doc = c.doc
    useTreeStore.getState().replace(doc)

    render(
      <PersonPanel
        personId={c.childId}
        onDeleted={() => {}}
        onClose={() => {}}
      />,
    )
    expect(screen.getByText('続柄')).toBeInTheDocument()
    const comboboxes = screen.getAllByRole('combobox')
    fireEvent.change(comboboxes[comboboxes.length - 1], {
      target: { value: 'adopted' },
    })

    const family = useTreeStore.getState().document.families[c.familyId]
    expect(family.children[0].pedigree).toBe('adopted')
  })

  it('親がいない人物には続柄セクションが表示されない', () => {
    render(
      <PersonPanel
        personId={personAId}
        onDeleted={() => {}}
        onClose={() => {}}
      />,
    )
    expect(screen.queryByText('続柄')).not.toBeInTheDocument()
  })
})

describe('PersonPanel: 人物の削除', () => {
  it('確認ダイアログに影響件数が表示され、承認すると削除されonDeletedが呼ばれる', () => {
    let doc = useTreeStore.getState().document
    const b = addSpouse(doc, personAId, { name: { given: 'B' } })
    doc = b.doc
    const c = addChild(
      doc,
      personAId,
      { name: { given: 'C' } },
      { otherParentId: b.spouseId },
    )
    doc = c.doc
    useTreeStore.getState().replace(doc)

    const onDeleted = vi.fn()
    render(
      <PersonPanel
        personId={personAId}
        onDeleted={onDeleted}
        onClose={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'この人物を削除' }))

    expect(screen.getByText(/配偶者とのつながり1件/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '削除する' }))

    expect(useTreeStore.getState().document.persons[personAId]).toBeUndefined()
    expect(onDeleted).toHaveBeenCalledTimes(1)
  })

  it('キャンセルすると削除されずonDeletedも呼ばれない', () => {
    const onDeleted = vi.fn()
    render(
      <PersonPanel
        personId={personAId}
        onDeleted={onDeleted}
        onClose={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'この人物を削除' }))
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))

    expect(useTreeStore.getState().document.persons[personAId]).toBeDefined()
    expect(onDeleted).not.toHaveBeenCalled()
  })

  it('削除直後にundoすると人物と関係が復元される', () => {
    let doc = useTreeStore.getState().document
    const b = addSpouse(doc, personAId, { name: { given: 'B' } })
    doc = b.doc
    useTreeStore.getState().replace(doc)

    const onDeleted = vi.fn()
    render(
      <PersonPanel
        personId={personAId}
        onDeleted={onDeleted}
        onClose={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'この人物を削除' }))
    fireEvent.click(screen.getByRole('button', { name: '削除する' }))
    expect(useTreeStore.getState().document.persons[personAId]).toBeUndefined()

    useTreeStore.getState().undo()
    const restored = useTreeStore.getState().document
    expect(restored.persons[personAId]).toBeDefined()
    expect(
      Object.values(restored.families).some((f) =>
        f.spouseIds.includes(personAId),
      ),
    ).toBe(true)
  })
})

describe('PersonPanel: 既存の人物を関係先に選ぶ', () => {
  /** 既存人物選択モードへ切り替えて絞り込み欄(PersonPicker)を返す。
   * 編集フォームの性別・続柄など他の`<select>`と紛れないよう、見出しのラベルで特定する */
  const EXISTING_LABEL: Record<string, string> = {
    配偶者を追加: '既存の人物と新しい婚姻を作る',
    子を追加: '既存の人物を子として紐づける',
    親を追加: '既存の人物を親として紐づける',
  }
  function openExisting(action: string) {
    fireEvent.click(screen.getByRole('button', { name: action }))
    fireEvent.click(screen.getByRole('button', { name: '既存の人物から選ぶ' }))
    return screen.getByLabelText(EXISTING_LABEL[action])
  }

  /** 絞り込み欄で候補一覧を開き、氏名の並びを返す(他の<select>のoptionと混ざらないよう
   * listboxにスコープする) */
  function candidateNames(action: string) {
    fireEvent.focus(openExisting(action))
    return within(screen.getByRole('listbox'))
      .getAllByRole('option')
      .map((o) => o.textContent)
  }

  /** 氏名を入力して候補をクリックし、既存人物としてリンクする */
  function selectExisting(action: string, name: string) {
    fireEvent.change(openExisting(action), { target: { value: name } })
    fireEvent.click(
      within(screen.getByRole('listbox')).getByRole('option', { name }),
    )
  }

  it('既存の人物を配偶者にすると新しい家族が作られ、人物は増えない', () => {
    const x = addPerson(useTreeStore.getState().document, {
      name: { given: 'X' },
    })
    useTreeStore.getState().replace(x.doc)

    render(
      <PersonPanel
        personId={personAId}
        onDeleted={() => {}}
        onClose={() => {}}
      />,
    )
    selectExisting('配偶者を追加', 'X')

    const doc = useTreeStore.getState().document
    expect(Object.values(doc.persons)).toHaveLength(2)
    const family = Object.values(doc.families).find((f) =>
      f.spouseIds.includes(personAId),
    )
    expect(family?.spouseIds.sort()).toEqual([personAId, x.personId].sort())
  })

  it('既存の人物を子にすると、配偶者がいる場合はその家族へ帰属する', () => {
    let doc = useTreeStore.getState().document
    const b = addSpouse(doc, personAId, { name: { given: 'B' } })
    doc = b.doc
    const x = addPerson(doc, { name: { given: 'X' } })
    useTreeStore.getState().replace(x.doc)

    render(
      <PersonPanel
        personId={personAId}
        onDeleted={() => {}}
        onClose={() => {}}
      />,
    )
    selectExisting('子を追加', 'X')

    const next = useTreeStore.getState().document
    expect(next.families[b.familyId].children).toEqual([
      { childId: x.personId, pedigree: 'biological' },
    ])
    expect(Object.values(next.persons)).toHaveLength(3)
  })

  it('既存の人物を親にすると、ひとり親の家族へ合流する', () => {
    let doc = useTreeStore.getState().document
    const p = addParent(doc, personAId, { name: { given: 'P' } })
    doc = p.doc
    const q = addPerson(doc, { name: { given: 'Q' } })
    useTreeStore.getState().replace(q.doc)

    render(
      <PersonPanel
        personId={personAId}
        onDeleted={() => {}}
        onClose={() => {}}
      />,
    )
    selectExisting('親を追加', 'Q')

    const next = useTreeStore.getState().document
    expect(next.families[p.familyId].spouseIds).toEqual([
      p.parentId,
      q.personId,
    ])
  })

  it('もう一方の親を選ぶと、夫婦の子として記録し直される', () => {
    // 片方の親Pだけが登録された子A(=系線がPから直接伸びる状態)と、別の家族にいるPの配偶者Q
    let doc = useTreeStore.getState().document
    const p = addParent(doc, personAId, { name: { given: 'P' } })
    doc = p.doc
    const q = addSpouse(doc, p.parentId, { name: { given: 'Q' } })
    useTreeStore.getState().replace(q.doc)

    render(
      <PersonPanel
        personId={personAId}
        onDeleted={() => {}}
        onClose={() => {}}
      />,
    )
    selectExisting('親を追加', 'Q')

    const next = useTreeStore.getState().document
    // 同じ夫婦の家族が二重にならず、AはP・Qの子として1つの家族に属する
    expect(next.families[p.familyId]).toBeUndefined()
    expect(next.families[q.familyId].spouseIds).toEqual([
      p.parentId,
      q.spouseId,
    ])
    expect(next.families[q.familyId].children.map((c) => c.childId)).toEqual([
      personAId,
    ])
    expect(
      Object.values(next.families).filter((f) =>
        f.spouseIds.includes(p.parentId),
      ),
    ).toHaveLength(1)
  })

  it('親に空き殻の家族が残っていても、既存の人物を親にすると夫婦の家族へ入る', () => {
    // 親Pが婚姻(Q)に加えて、旧バージョンが残した空き殻(配偶者1件・子0件)を持つ
    let doc = useTreeStore.getState().document
    const p = addPerson(doc, { name: { given: 'P' } })
    doc = p.doc
    const q = addSpouse(doc, p.personId, { name: { given: 'Q' } })
    doc = q.doc
    doc = {
      ...doc,
      families: {
        ...doc.families,
        shell: {
          id: 'shell',
          spouseIds: [p.personId],
          kind: 'unknown',
          events: [],
          children: [],
        },
      },
    }
    useTreeStore.getState().replace(doc)

    render(
      <PersonPanel
        personId={personAId}
        onDeleted={() => {}}
        onClose={() => {}}
      />,
    )
    selectExisting('親を追加', 'P')

    const next = useTreeStore.getState().document
    expect(next.families[q.familyId].children.map((c) => c.childId)).toEqual([
      personAId,
    ])
    // 配偶者不在の家族が新設されない(空き殻は残るが、子は増えない)
    expect(next.families.shell.children).toEqual([])
    expect(Object.values(next.families)).toHaveLength(2)
  })

  it('氏名で絞り込める', () => {
    let doc = useTreeStore.getState().document
    doc = addPerson(doc, { name: { given: 'Xavier' } }).doc
    doc = addPerson(doc, { name: { given: 'Yumi' } }).doc
    useTreeStore.getState().replace(doc)

    render(
      <PersonPanel
        personId={personAId}
        onDeleted={() => {}}
        onClose={() => {}}
      />,
    )
    fireEvent.change(openExisting('配偶者を追加'), { target: { value: 'Xa' } })

    expect(
      within(screen.getByRole('listbox'))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Xavier'])
  })

  it('自分自身と既に配偶者である人物は配偶者の候補に出ない', () => {
    let doc = useTreeStore.getState().document
    const b = addSpouse(doc, personAId, { name: { given: 'B' } })
    doc = b.doc
    const x = addPerson(doc, { name: { given: 'X' } })
    useTreeStore.getState().replace(x.doc)

    render(
      <PersonPanel
        personId={personAId}
        onDeleted={() => {}}
        onClose={() => {}}
      />,
    )
    expect(candidateNames('配偶者を追加')).toEqual(['X'])
  })

  it('祖先は子の候補に出ない(世代方向の循環の防止)', () => {
    let doc = useTreeStore.getState().document
    // A の親 P、その親 G を作る
    const p = addParent(doc, personAId, { name: { given: 'P' } })
    doc = p.doc
    const g = addParent(doc, p.parentId, { name: { given: 'G' } })
    doc = g.doc
    const x = addPerson(doc, { name: { given: 'X' } })
    useTreeStore.getState().replace(x.doc)

    render(
      <PersonPanel
        personId={personAId}
        onDeleted={() => {}}
        onClose={() => {}}
      />,
    )
    const names = candidateNames('子を追加')

    expect(names).not.toContain('P')
    expect(names).not.toContain('G')
    expect(names).toContain('X')
  })

  it('配偶者は親の候補に出ない(linkParentの「配偶者を子にできない」ガードとの整合。監査 低1)', () => {
    // A–B夫婦。Aの「親を追加 > 既存から」でBを選ぶと、linkParentの経路2で
    // A–B家族へAを子として合流させることになり「家族の配偶者を子にはできません」で
    // 例外になる。候補一覧の時点でBを除外する
    let doc = useTreeStore.getState().document
    const b = addSpouse(doc, personAId, { name: { given: 'B' } })
    doc = b.doc
    const x = addPerson(doc, { name: { given: 'X' } })
    useTreeStore.getState().replace(x.doc)

    render(
      <PersonPanel
        personId={personAId}
        onDeleted={() => {}}
        onClose={() => {}}
      />,
    )
    const names = candidateNames('親を追加')

    expect(names).not.toContain('B')
    expect(names).toContain('X')
  })

  it('同じひとり親家族の子(きょうだい)は親の候補に出ない(linkParentの「子を配偶者にできない」ガードとの整合)', () => {
    // ひとり親Pの子C・D。Cの親にDを選ぶと、linkParentの経路1でDが同じ家族の
    // 配偶者と子を兼ねてしまうため例外になる。候補一覧の時点でDを除外する
    let doc = useTreeStore.getState().document
    const c = addChild(doc, personAId, { name: { given: 'C' } })
    doc = c.doc
    const d = addChild(doc, personAId, { name: { given: 'D' } })
    doc = d.doc
    const x = addPerson(doc, { name: { given: 'X' } })
    useTreeStore.getState().replace(x.doc)

    render(
      <PersonPanel
        personId={c.childId}
        onDeleted={() => {}}
        onClose={() => {}}
      />,
    )
    const names = candidateNames('親を追加')

    expect(names).not.toContain('D')
    // 既にいる親(A)も候補から外れる
    expect(names).not.toContain('A')
    expect(names).toContain('X')
  })

  it('子孫は親の候補に出ない(collectDescendantsによる一括循環判定)', () => {
    // Aの子C、Cの子G。Aの親候補にC・Gは出ない(循環になるため)
    let doc = useTreeStore.getState().document
    const c = addChild(doc, personAId, { name: { given: 'C' } })
    doc = c.doc
    const g = addChild(doc, c.childId, { name: { given: 'G' } })
    doc = g.doc
    const x = addPerson(doc, { name: { given: 'X' } })
    useTreeStore.getState().replace(x.doc)

    render(
      <PersonPanel
        personId={personAId}
        onDeleted={() => {}}
        onClose={() => {}}
      />,
    )
    const names = candidateNames('親を追加')

    expect(names).not.toContain('C')
    expect(names).not.toContain('G')
    expect(names).toContain('X')
  })

  it('リンクしても対象人物のデータは変わらず、undoで取り消せる', () => {
    const x = addPerson(useTreeStore.getState().document, {
      name: { surname: '富岡', given: '榮', surnameKana: 'とみおか' },
      note: 'メモ',
    })
    useTreeStore.getState().replace(x.doc)
    const original = x.doc.persons[x.personId]

    render(
      <PersonPanel
        personId={personAId}
        onDeleted={() => {}}
        onClose={() => {}}
      />,
    )
    selectExisting('配偶者を追加', '富岡 榮')

    expect(useTreeStore.getState().document.persons[x.personId]).toEqual(
      original,
    )
    expect(Object.keys(useTreeStore.getState().document.families)).toHaveLength(
      1,
    )

    useTreeStore.getState().undo()
    expect(Object.keys(useTreeStore.getState().document.families)).toHaveLength(
      0,
    )
    expect(useTreeStore.getState().document.persons[x.personId]).toEqual(
      original,
    )
  })

  it('候補がいない場合はその旨が示される', () => {
    render(
      <PersonPanel
        personId={personAId}
        onDeleted={() => {}}
        onClose={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '配偶者を追加' }))
    fireEvent.click(screen.getByRole('button', { name: '既存の人物から選ぶ' }))

    expect(
      screen.getByText('この関係に選べる既存の人物はいません。'),
    ).toBeDefined()
  })
})

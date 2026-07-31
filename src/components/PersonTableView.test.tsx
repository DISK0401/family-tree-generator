import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addPerson, addSpouse } from '../domain/commands'
import { createTreeDocument } from '../domain/helpers'
import { useDisplaySettingsStore } from '../settings/display-settings-store'
import { useTreeStore } from '../store/tree-store'
import { PersonTableView } from './PersonTableView'

/**
 * 表形式ビュー(spec person-table-editor)。操作はrole/ラベル経由で行い、
 * 内部DOM構造へは依存しない(既存のコンポーネントテスト方針を踏襲)。
 */

function seedDocument(): { taroId: string; hanakoId: string } {
  let doc = createTreeDocument()
  const taro = addPerson(doc, {
    name: {
      surname: '山田',
      given: '太郎',
      surnameKana: 'やまだ',
      givenKana: 'たろう',
    },
    gender: 'male',
    birth: {
      type: 'birth',
      date: {
        original: '昭和39年10月10日',
        qualifier: 'exact',
        date: { year: 1964, month: 10, day: 10 },
      },
      place: '東京',
    },
    note: 'メモ',
  })
  doc = taro.doc
  const hanako = addPerson(doc, {
    name: { surname: '佐藤', given: '花子', surnameKana: 'さとう' },
    gender: 'female',
    birth: {
      type: 'birth',
      date: {
        original: '1970-01-02',
        qualifier: 'exact',
        date: { year: 1970, month: 1, day: 2 },
      },
    },
  })
  doc = hanako.doc
  useTreeStore.getState().replace(doc)
  return { taroId: taro.personId, hanakoId: hanako.personId }
}

/** 行(tr)の並びを氏名で取り出す。ヘッダー行は除く */
function rowNames(): string[] {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('gridcell')[0].textContent ?? '')
}

function enterEditMode() {
  fireEvent.click(screen.getByRole('button', { name: '編集' }))
}

function cellOf(rowIndex: number, columnLabel: string): HTMLElement {
  const row = screen.getAllByRole('row')[rowIndex + 1]
  const headers = screen
    .getAllByRole('columnheader')
    .map((h) => h.textContent?.replace(/[↑↓]/g, '').trim())
  const col = headers.indexOf(columnLabel)
  if (col < 0) throw new Error(`列が見つからない: ${columnLabel}`)
  return within(row).getAllByRole('gridcell')[col]
}

describe('PersonTableView: 閲覧(spec「列構成」「並べ替えと絞り込み」)', () => {
  beforeEach(() => {
    // 表示設定は他テストの影響を受けないよう既定(西暦)へ戻す
    useDisplaySettingsStore.getState().setCalendarMode('gregorian')
    seedDocument()
  })

  it('人物属性が対応する列の値として表示される', () => {
    render(
      <PersonTableView selectedPersonId={null} onSelectPerson={() => {}} />,
    )

    expect(cellOf(0, '姓').textContent).toBe('山田')
    expect(cellOf(0, '名').textContent).toBe('太郎')
    expect(cellOf(0, '姓(ふりがな)').textContent).toBe('やまだ')
    expect(cellOf(0, '性別').textContent).toBe('男')
    expect(cellOf(0, '生年月日').textContent).toBe('1964-10-10')
    expect(cellOf(0, '出生地').textContent).toBe('東京')
    expect(cellOf(0, 'メモ').textContent).toBe('メモ')
  })

  it('日付列が表示設定(和暦)に追従する', () => {
    render(
      <PersonTableView selectedPersonId={null} onSelectPerson={() => {}} />,
    )
    expect(cellOf(0, '生年月日').textContent).toBe('1964-10-10')

    act(() => {
      useDisplaySettingsStore.getState().setCalendarMode('wareki')
    })
    expect(cellOf(0, '生年月日').textContent).toBe('昭和39年10月10日')
  })

  it('配偶者列に配偶者の氏名が並ぶ(読み取り専用)', () => {
    const { taroId } = seedDocument()
    useTreeStore.getState().replace(
      addSpouse(useTreeStore.getState().document, taroId, {
        name: { given: '配偶者' },
      }).doc,
    )
    render(
      <PersonTableView selectedPersonId={null} onSelectPerson={() => {}} />,
    )

    expect(cellOf(0, '配偶者').textContent).toBe('配偶者')
  })

  it('ふりがなで絞り込める', () => {
    render(
      <PersonTableView selectedPersonId={null} onSelectPerson={() => {}} />,
    )
    expect(rowNames()).toHaveLength(2)

    fireEvent.change(screen.getByRole('searchbox', { name: /絞り込み/ }), {
      target: { value: 'やまだ' },
    })

    expect(rowNames()).toEqual(['山田'])
  })

  it('生年月日で並べ替えられ、未入力は末尾に置かれる', () => {
    // 生年月日のない人物を足す
    useTreeStore.getState().replace(
      addPerson(useTreeStore.getState().document, {
        name: { surname: '無名' },
      }).doc,
    )
    render(
      <PersonTableView selectedPersonId={null} onSelectPerson={() => {}} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /生年月日/ }))
    expect(rowNames()).toEqual(['山田', '佐藤', '無名'])

    // 降順でも未入力は末尾のまま
    fireEvent.click(screen.getByRole('button', { name: /生年月日/ }))
    expect(rowNames()).toEqual(['佐藤', '山田', '無名'])
  })

  it('並べ替え・絞り込みはドキュメントを変更しない', () => {
    render(
      <PersonTableView selectedPersonId={null} onSelectPerson={() => {}} />,
    )
    const before = useTreeStore.getState().document

    fireEvent.click(screen.getByRole('button', { name: /生年月日/ }))
    fireEvent.change(screen.getByRole('searchbox', { name: /絞り込み/ }), {
      target: { value: 'やまだ' },
    })

    expect(useTreeStore.getState().document).toBe(before)
  })

  it('行クリックで選択が通知される(選択の共有)', () => {
    const { taroId } = seedDocument()
    const onSelectPerson = vi.fn()
    render(
      <PersonTableView
        selectedPersonId={null}
        onSelectPerson={onSelectPerson}
      />,
    )

    fireEvent.click(cellOf(0, '姓'))
    expect(onSelectPerson).toHaveBeenCalledWith(taroId)
  })
})

describe('PersonTableView: 閲覧モードでは編集できない(spec「閲覧モードと編集モードの切り替え」)', () => {
  beforeEach(() => {
    seedDocument()
  })

  it('セルをクリックしても編集が始まらない', () => {
    render(
      <PersonTableView selectedPersonId={null} onSelectPerson={() => {}} />,
    )

    fireEvent.doubleClick(cellOf(0, '姓'))
    expect(
      screen.queryByRole('textbox', { name: '姓' }),
    ).not.toBeInTheDocument()
  })

  it('編集モードへ切り替えるとゴースト行が現れる', () => {
    render(
      <PersonTableView selectedPersonId={null} onSelectPerson={() => {}} />,
    )
    expect(rowNames()).toHaveLength(2)

    enterEditMode()
    // 既存2行+新規入力用のゴースト行
    expect(screen.getAllByRole('row')).toHaveLength(1 + 3)
    expect(screen.getByText('新しい人物…')).toBeInTheDocument()
  })
})

describe('PersonTableView: セル編集(spec「セル編集」)', () => {
  beforeEach(() => {
    seedDocument()
  })

  it('氏名セルの編集が確定でストアへ反映され、undoで戻る', () => {
    render(
      <PersonTableView selectedPersonId={null} onSelectPerson={() => {}} />,
    )
    enterEditMode()

    fireEvent.doubleClick(cellOf(0, '姓'))
    const input = screen.getByRole('textbox', { name: '姓' })
    fireEvent.change(input, { target: { value: '渡辺' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    const persons = Object.values(useTreeStore.getState().document.persons)
    expect(persons.some((p) => p.name.surname === '渡辺')).toBe(true)

    act(() => {
      useTreeStore.getState().undo()
    })
    const after = Object.values(useTreeStore.getState().document.persons)
    expect(after.some((p) => p.name.surname === '山田')).toBe(true)
  })

  it('値が変わらない確定では履歴が増えない', () => {
    render(
      <PersonTableView selectedPersonId={null} onSelectPerson={() => {}} />,
    )
    enterEditMode()
    const pastBefore = useTreeStore.getState().past.length

    fireEvent.doubleClick(cellOf(0, '姓'))
    const input = screen.getByRole('textbox', { name: '姓' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(useTreeStore.getState().past.length).toBe(pastBefore)
  })

  it('IME変換中のEnterではセルの確定・移動が起こらない', () => {
    render(
      <PersonTableView selectedPersonId={null} onSelectPerson={() => {}} />,
    )
    enterEditMode()

    fireEvent.doubleClick(cellOf(0, '姓'))
    const input = screen.getByRole('textbox', { name: '姓' })
    fireEvent.compositionStart(input)
    fireEvent.change(input, { target: { value: 'わたなべ' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    // 編集は継続中(エディタが残っている)で、ストアは未変更
    expect(screen.getByRole('textbox', { name: '姓' })).toBeInTheDocument()
    const persons = Object.values(useTreeStore.getState().document.persons)
    expect(persons.some((p) => p.name.surname === '山田')).toBe(true)

    // 変換確定後のEnterは通常どおりセルを確定する
    fireEvent.compositionEnd(input)
    fireEvent.change(input, { target: { value: '渡辺' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(
      Object.values(useTreeStore.getState().document.persons).some(
        (p) => p.name.surname === '渡辺',
      ),
    ).toBe(true)
  })

  it('解釈できない日付は値を変えずセルにエラーを表示する', () => {
    render(
      <PersonTableView selectedPersonId={null} onSelectPerson={() => {}} />,
    )
    enterEditMode()

    fireEvent.doubleClick(cellOf(0, '生年月日'))
    const input = screen.getByRole('textbox', { name: '生年月日' })
    fireEvent.change(input, { target: { value: '昭和99年13月40日' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    const cell = cellOf(0, '生年月日')
    expect(cell).toHaveAttribute('aria-invalid', 'true')
    const person = Object.values(useTreeStore.getState().document.persons).find(
      (p) => p.name.surname === '山田',
    )
    expect(person?.birth?.date?.date).toEqual({
      year: 1964,
      month: 10,
      day: 10,
    })
  })

  it('Escで編集を取り消せる', () => {
    render(
      <PersonTableView selectedPersonId={null} onSelectPerson={() => {}} />,
    )
    enterEditMode()

    fireEvent.doubleClick(cellOf(0, '姓'))
    const input = screen.getByRole('textbox', { name: '姓' })
    fireEvent.change(input, { target: { value: '破棄される' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(cellOf(0, '姓').textContent).toBe('山田')
  })
})

describe('PersonTableView: 行追加(spec「行追加による人物の追加」)', () => {
  beforeEach(() => {
    seedDocument()
  })

  it('ゴースト行への入力確定で人物が追加される', () => {
    render(
      <PersonTableView selectedPersonId={null} onSelectPerson={() => {}} />,
    )
    enterEditMode()

    // ゴースト行は既存2行の次(index 2)
    fireEvent.doubleClick(cellOf(2, '姓'))
    const input = screen.getByRole('textbox', { name: '姓' })
    fireEvent.change(input, { target: { value: '新人' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    const persons = Object.values(useTreeStore.getState().document.persons)
    expect(persons).toHaveLength(3)
    expect(persons.some((p) => p.name.surname === '新人')).toBe(true)
  })

  it('空のまま確定しても人物は作られない', () => {
    render(
      <PersonTableView selectedPersonId={null} onSelectPerson={() => {}} />,
    )
    enterEditMode()

    fireEvent.doubleClick(cellOf(2, '姓'))
    const input = screen.getByRole('textbox', { name: '姓' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(Object.keys(useTreeStore.getState().document.persons)).toHaveLength(
      2,
    )
  })
})

describe('PersonTableView: 表が提供しない操作(spec「表が提供しない操作」)', () => {
  beforeEach(() => {
    seedDocument()
  })

  it('削除・関係編集のボタンが存在しない', () => {
    render(
      <PersonTableView selectedPersonId={null} onSelectPerson={() => {}} />,
    )
    enterEditMode()

    for (const name of [
      /削除/,
      /配偶者を追加/,
      /子を追加/,
      /親を追加/,
      /外す/,
    ]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
  })

  it('配偶者列のセルは編集を開始できない', () => {
    render(
      <PersonTableView selectedPersonId={null} onSelectPerson={() => {}} />,
    )
    enterEditMode()

    fireEvent.doubleClick(cellOf(0, '配偶者'))
    expect(
      screen.queryByRole('textbox', { name: '配偶者' }),
    ).not.toBeInTheDocument()
  })
})

describe('PersonTableView: grid構造(spec/a11y)', () => {
  beforeEach(() => {
    seedDocument()
  })

  it('role=grid・columnheader・gridcellの構造を持つ', () => {
    render(
      <PersonTableView selectedPersonId={null} onSelectPerson={() => {}} />,
    )

    expect(screen.getByRole('grid', { name: '人物の一覧' })).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader')).toHaveLength(11)
    expect(screen.getAllByRole('gridcell').length).toBeGreaterThan(0)
  })

  it('編集モードではフォーカスセルのみtabindex=0(rovingフォーカス)', () => {
    render(
      <PersonTableView selectedPersonId={null} onSelectPerson={() => {}} />,
    )
    enterEditMode()

    const focusable = screen
      .getAllByRole('gridcell')
      .filter((cell) => cell.getAttribute('tabindex') === '0')
    expect(focusable).toHaveLength(1)
  })
})

import { fireEvent, render, screen } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTreeDocument } from '../../domain/helpers'
import type { TreeDocument } from '../../domain/types'
import { DEFAULT_DISPLAY_SETTINGS } from '../../store/display-settings'
import { useDisplaySettingsStore } from '../../store/display-settings-store'
import { useTreeStore } from '../../store/tree-store'
import { FamilyTreeCanvas } from './FamilyTreeCanvas'

/**
 * 表示設定が2つの描画系へ等しく効くことの通し検証(tasks.md 9.1,
 * spec tree-rendering「人物カードの表現の一致」)。
 *
 * `person-card.ts`の単体テストは「同じ`PersonCardView`から同じHTMLが出る」ことしか
 * 確かめられない。ここでは実際に折りたたみ表示(family-chart)とつながった全体表示
 * (PedigreeCanvas)の**両方をレンダリングして、描画されたカードのDOMどうしを突き合わせる**。
 * 片方の描画系だけが設定を読み落としている、といった取りこぼしはこの形でしか検出できない。
 */

const PERSON_ID = 'a'

function docWithOnePerson(): TreeDocument {
  const doc = createTreeDocument()
  doc.persons[PERSON_ID] = {
    id: PERSON_ID,
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
        original: '1900-04-01',
        qualifier: 'exact',
        date: { year: 1900, month: 4, day: 1 },
      },
      place: '東京',
    },
    death: {
      type: 'death',
      date: {
        original: '1970-05-06',
        qualifier: 'exact',
        date: { year: 1970, month: 5, day: 6 },
      },
      place: '京都',
    },
  }
  return doc
}

/** 折りたたみ表示・つながった全体表示それぞれで実際に描かれたカードのHTMLを取り出す */
function renderBothModes(): { collapsed: string; connected: string } {
  const { container, unmount } = render(
    <FamilyTreeCanvas selectedPersonId={null} onSelectPerson={() => {}} />,
  )

  const collapsedCard = container.querySelector('.f3 .tree-card')
  expect(collapsedCard, '折りたたみ表示にカードが描かれていない').not.toBeNull()
  const collapsed = collapsedCard?.outerHTML ?? ''

  fireEvent.click(screen.getByRole('button', { name: 'つながった全体表示' }))

  const connectedCard = container.querySelector('.pedigree-card .tree-card')
  expect(
    connectedCard,
    'つながった全体表示にカードが描かれていない',
  ).not.toBeNull()
  const connected = connectedCard?.outerHTML ?? ''

  unmount()
  return { collapsed, connected }
}

/**
 * 特定の人物IDのカードを、折りたたみ表示・つながった全体表示それぞれから取り出す。
 * family-chartは`.card[data-id]`、PedigreeCanvasは`.pedigree-card[data-person-id]`に
 * 人物IDを持つ(それぞれのDOM構造を参照)
 */
function renderBothModesForPerson(personId: string): {
  collapsed: string
  connected: string
} {
  const { container, unmount } = render(
    <FamilyTreeCanvas selectedPersonId={null} onSelectPerson={() => {}} />,
  )

  const collapsedCard = container.querySelector(
    `.card[data-id="${personId}"] .tree-card`,
  )
  expect(
    collapsedCard,
    `折りたたみ表示に人物${personId}のカードが描かれていない`,
  ).not.toBeNull()
  const collapsed = collapsedCard?.outerHTML ?? ''

  fireEvent.click(screen.getByRole('button', { name: 'つながった全体表示' }))

  const connectedCard = container.querySelector(
    `.pedigree-card[data-person-id="${personId}"] .tree-card`,
  )
  expect(
    connectedCard,
    `つながった全体表示に人物${personId}のカードが描かれていない`,
  ).not.toBeNull()
  const connected = connectedCard?.outerHTML ?? ''

  unmount()
  return { collapsed, connected }
}

/** 親1人・子2人(出生順1・2)の家族。出生順位ラベルの一致検証に使う(issue #49, 6.3) */
function docWithBirthOrderSiblings(): TreeDocument {
  const doc = createTreeDocument()
  doc.persons.parent = { id: 'parent', name: { given: '親' }, gender: 'male' }
  doc.persons.c1 = {
    id: 'c1',
    name: { given: '一郎' },
    gender: 'male',
    birthOrder: 1,
  }
  doc.persons.c2 = {
    id: 'c2',
    name: { given: '二郎' },
    gender: 'male',
    birthOrder: 2,
  }
  doc.families.f1 = {
    id: 'f1',
    spouseIds: ['parent'],
    kind: 'unknown',
    events: [],
    children: [
      { childId: 'c1', pedigree: 'biological' },
      { childId: 'c2', pedigree: 'biological' },
    ],
  }
  return doc
}

beforeEach(() => {
  useTreeStore.getState().replace(docWithOnePerson())
  act(() => {
    useDisplaySettingsStore.setState({ ...DEFAULT_DISPLAY_SETTINGS })
  })
})

afterEach(() => {
  act(() => {
    useDisplaySettingsStore.setState({ ...DEFAULT_DISPLAY_SETTINGS })
  })
})

describe('カード表現の一致(9.1)', () => {
  it('既定の表示設定で、両方の描画系のカードが一致する', () => {
    const { collapsed, connected } = renderBothModes()
    expect(connected).toBe(collapsed)
    // 突き合わせが空文字どうしの一致で通っていないことの確認
    expect(collapsed).toContain('山田')
    expect(collapsed).toContain('太郎')
  })

  it('姓を非表示にすると、両方の描画系で姓が消えて名だけになる', () => {
    act(() => {
      useDisplaySettingsStore.getState().setVisibleCardField('surname', false)
    })
    const { collapsed, connected } = renderBothModes()

    expect(connected).toBe(collapsed)
    expect(collapsed).not.toContain('山田')
    expect(collapsed).toContain('太郎')
  })

  it('和暦表示にすると、両方の描画系で生没年月日が和暦になる', () => {
    act(() => {
      useDisplaySettingsStore.getState().setCalendarMode('wareki')
    })
    const { collapsed, connected } = renderBothModes()

    expect(connected).toBe(collapsed)
    expect(collapsed).toContain('明治') // 1900年
    expect(collapsed).toContain('昭和') // 1970年
  })

  it('生年月日の粒度を年のみにすると、両方の描画系で月日が消える', () => {
    act(() => {
      useDisplaySettingsStore.getState().setBirthDateGranularity('year')
      useDisplaySettingsStore.getState().setDeathDateGranularity('year')
    })
    const { collapsed, connected } = renderBothModes()

    expect(connected).toBe(collapsed)
    expect(collapsed).toContain('1900')
    expect(collapsed).not.toContain('1900-04-01')
  })

  it('故人マーカー(†)が両方の描画系に等しく現れる', () => {
    const { collapsed, connected } = renderBothModes()
    expect(collapsed).toContain('†')
    expect(connected).toContain('†')
    expect(connected).toBe(collapsed)
  })

  it('出生順位ラベル(長男/次男)が両方の描画系で一致する(issue #49)', () => {
    useTreeStore.getState().replace(docWithBirthOrderSiblings())
    const { collapsed, connected } = renderBothModesForPerson('c2')

    expect(connected).toBe(collapsed)
    expect(collapsed).toContain(
      '<div class="tree-card-birth-order">次男</div>',
    )
  })

  it('4文字以上の氏名でも、両方の描画系で同じ縮小フォントサイズの1列として表示される', () => {
    useTreeStore.getState().replace({
      ...docWithOnePerson(),
      persons: {
        [PERSON_ID]: {
          id: PERSON_ID,
          name: { surname: '富岡', given: '愛梨奈美' },
          gender: 'female',
        },
      },
    })
    const { collapsed, connected } = renderBothModes()

    expect(connected).toBe(collapsed)
    expect(collapsed).toContain('愛梨奈美')
    expect(collapsed).toMatch(/tree-card-given" style="font-size: 0\.\d+em"/)
    // 折り返しによる複数列化(bug再発)が起きていないことの確認
    expect(collapsed.match(/tree-card-given/g)).toHaveLength(1)
  })
})

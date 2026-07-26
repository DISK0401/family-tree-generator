import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addPerson, addSpouse, linkSpouse, unlinkChild, addChild } from '../domain/commands'
import { createTreeDocument } from '../domain/helpers'
import { computeOffChartPersonIds } from '../rendering/to-family-chart-data'
import { useTreeStore } from '../store/tree-store'
import { UnconnectedTray } from './UnconnectedTray'

let personAId = ''

beforeEach(() => {
  const a = addPerson(createTreeDocument(), { name: { given: 'A' } })
  personAId = a.personId
  useTreeStore.getState().replace(a.doc)
})

/** ストアの現在のドキュメントから、Aを視点にした「図に現れていない人物」を求める */
function offChartIds(): string[] {
  return computeOffChartPersonIds(useTreeStore.getState().document, personAId)
}

describe('UnconnectedTray', () => {
  it('対象人物が氏名のチップとして並ぶ', () => {
    let doc = useTreeStore.getState().document
    for (const given of ['X', 'Y', 'Z']) {
      doc = addPerson(doc, { name: { surname: '富岡', given } }).doc
    }
    useTreeStore.getState().replace(doc)

    render(
      <UnconnectedTray
        personIds={offChartIds()}
        selectedPersonId={null}
        onSelectPerson={() => {}}
      />,
    )

    expect(screen.getByRole('button', { name: '富岡 X' })).toBeDefined()
    expect(screen.getByRole('button', { name: '富岡 Y' })).toBeDefined()
    expect(screen.getByRole('button', { name: '富岡 Z' })).toBeDefined()
  })

  it('対象が0人のときは領域ごと描画しない', () => {
    const { container } = render(
      <UnconnectedTray personIds={[]} selectedPersonId={null} onSelectPerson={() => {}} />,
    )
    expect(container.firstChild).toBeNull()
    expect(screen.queryByLabelText('図に現れていない人物')).toBeNull()
  })

  it('チップのクリックでその人物が選択される', () => {
    const x = addPerson(useTreeStore.getState().document, { name: { given: 'X' } })
    useTreeStore.getState().replace(x.doc)
    const onSelectPerson = vi.fn()

    render(
      <UnconnectedTray
        personIds={offChartIds()}
        selectedPersonId={null}
        onSelectPerson={onSelectPerson}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'X' }))

    expect(onSelectPerson).toHaveBeenCalledWith(x.personId)
  })

  it('選択中の人物のチップは選択状態として示される', () => {
    const x = addPerson(useTreeStore.getState().document, { name: { given: 'X' } })
    useTreeStore.getState().replace(x.doc)

    render(
      <UnconnectedTray
        personIds={offChartIds()}
        selectedPersonId={x.personId}
        onSelectPerson={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: 'X' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('関係を持たない人物は現れ、配偶者としてリンクすると消える', () => {
    const x = addPerson(useTreeStore.getState().document, { name: { given: 'X' } })
    useTreeStore.getState().replace(x.doc)

    const { rerender } = render(
      <UnconnectedTray
        personIds={offChartIds()}
        selectedPersonId={null}
        onSelectPerson={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: 'X' })).toBeDefined()

    useTreeStore.getState().apply((doc) => linkSpouse(doc, personAId, x.personId).doc)
    rerender(
      <UnconnectedTray
        personIds={offChartIds()}
        selectedPersonId={null}
        onSelectPerson={() => {}}
      />,
    )
    expect(screen.queryByRole('button', { name: 'X' })).toBeNull()
  })

  it('本体と関係を持たない夫婦のクラスタも対象になる', () => {
    let doc = useTreeStore.getState().document
    const y = addPerson(doc, { name: { given: 'Y' } })
    doc = y.doc
    const z = addSpouse(doc, y.personId, { name: { given: 'Z' } })
    doc = z.doc
    useTreeStore.getState().replace(doc)

    render(
      <UnconnectedTray
        personIds={offChartIds()}
        selectedPersonId={null}
        onSelectPerson={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: 'Y' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Z' })).toBeDefined()
  })

  it('関係を解除した人物が対象になる', () => {
    const c = addChild(useTreeStore.getState().document, personAId, { name: { given: 'C' } })
    useTreeStore.getState().replace(c.doc)

    const { rerender } = render(
      <UnconnectedTray
        personIds={offChartIds()}
        selectedPersonId={null}
        onSelectPerson={() => {}}
      />,
    )
    expect(screen.queryByRole('button', { name: 'C' })).toBeNull()

    useTreeStore.getState().apply((doc) => unlinkChild(doc, c.familyId, c.childId))
    rerender(
      <UnconnectedTray
        personIds={offChartIds()}
        selectedPersonId={null}
        onSelectPerson={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: 'C' })).toBeDefined()
  })
})

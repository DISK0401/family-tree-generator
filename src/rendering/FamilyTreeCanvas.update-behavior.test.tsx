import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addPerson, updatePerson } from '../domain/commands'
import { createTreeDocument } from '../domain/helpers'
import type { TreeDocument } from '../domain/types'
import { useTreeStore } from '../store/tree-store'
import { FamilyTreeCanvas } from './FamilyTreeCanvas'

/**
 * family-chartへの更新指示(updateTree/updateData)の回数と内容の検証(監査 高1/中1/中3)。
 * 実チャートの描画結果ではなく「コンポーネントがライブラリへ何を指示したか」が対象のため、
 * family-chartはスタブへ差し替える(既存のFamilyTreeCanvas.test.tsxは実チャートで
 * モード切替等の統合を検証しており、役割を分担する)。
 */

interface ChartMock {
  updateTree: ReturnType<typeof vi.fn>
  updateData: ReturnType<typeof vi.fn>
  updateMainId: ReturnType<typeof vi.fn>
  store: {
    getTree: ReturnType<typeof vi.fn>
    getMainId: ReturnType<typeof vi.fn>
  }
  [key: string]: unknown
}

const h = vi.hoisted(() => ({ charts: [] as unknown[] }))

vi.mock('family-chart', () => {
  function createChartMock() {
    const card = {
      setStyle: vi.fn(),
      setCardDim: vi.fn(),
      setOnCardClick: vi.fn(),
      setCardInnerHtmlCreator: vi.fn(),
    }
    const chart: Record<string, unknown> = {
      updateTree: vi.fn(),
      updateData: vi.fn(),
      updateMainId: vi.fn(),
      setAfterUpdate: vi.fn(),
      setCardHtml: vi.fn(() => card),
      store: { getTree: vi.fn(() => undefined), getMainId: vi.fn(() => '') },
      svg: {},
    }
    for (const method of [
      'setTransitionTime',
      'setCardYSpacing',
      'setCardXSpacing',
      'setSingleParentEmptyCard',
      'setSortChildrenFunction',
      'setSortSpousesFunction',
      'setLinkSpouseText',
    ]) {
      chart[method] = vi.fn(() => chart)
    }
    h.charts.push(chart)
    return chart
  }
  return {
    default: {
      createChart: vi.fn(() => createChartMock()),
      handlers: { manualZoom: vi.fn() },
    },
  }
})

function latestChart(): ChartMock {
  const chart = h.charts[h.charts.length - 1]
  if (!chart) throw new Error('チャートが作成されていない')
  return chart as ChartMock
}

let personAId = ''

function seedDocument(): TreeDocument {
  let doc = createTreeDocument()
  const a = addPerson(doc, { name: { given: 'A' } })
  doc = a.doc
  personAId = a.personId
  doc = addPerson(doc, { name: { given: 'B' } }).doc
  return doc
}

beforeEach(() => {
  h.charts.length = 0
  useTreeStore.getState().replace(seedDocument())
})

describe('FamilyTreeCanvas: マウント時の初期化は1回に集約される(中1)', () => {
  it('マウント直後のupdateTreeは初期化(initial: true)の1回だけ', () => {
    render(
      <FamilyTreeCanvas selectedPersonId={null} onSelectPerson={() => {}} />,
    )
    const chart = latestChart()

    expect(chart.updateTree).toHaveBeenCalledTimes(1)
    expect(chart.updateTree).toHaveBeenCalledWith({
      initial: true,
      tree_position: 'fit',
    })
    expect(chart.updateData).not.toHaveBeenCalled()
  })
})

describe('FamilyTreeCanvas: 編集内容による更新の出し分け(高1)', () => {
  it('人物を追加すると全体フィット(fit)する', () => {
    render(
      <FamilyTreeCanvas selectedPersonId={null} onSelectPerson={() => {}} />,
    )
    const chart = latestChart()
    chart.updateTree.mockClear()

    act(() => {
      useTreeStore
        .getState()
        .apply((doc) => addPerson(doc, { name: { given: 'C' } }).doc)
    })

    expect(chart.updateData).toHaveBeenCalledTimes(1)
    expect(chart.updateTree).toHaveBeenCalledTimes(1)
    expect(chart.updateTree).toHaveBeenLastCalledWith({ tree_position: 'fit' })
  })

  it('名前変更などの内容編集ではフィットせず、パン位置を保つ(inherit)', () => {
    render(
      <FamilyTreeCanvas selectedPersonId={null} onSelectPerson={() => {}} />,
    )
    const chart = latestChart()
    chart.updateTree.mockClear()

    act(() => {
      useTreeStore
        .getState()
        .apply((doc) => updatePerson(doc, personAId, { name: { given: 'A2' } }))
    })

    // カード表示の更新(updateData+updateTree)自体は行うが、視界は動かさない
    expect(chart.updateData).toHaveBeenCalledTimes(1)
    expect(chart.updateTree).toHaveBeenCalledTimes(1)
    expect(chart.updateTree).toHaveBeenLastCalledWith({
      tree_position: 'inherit',
      transition_time: 0,
    })
  })
})

describe('FamilyTreeCanvas: connectedモード中の隠れチャート更新の停止(中3)', () => {
  it('connected中の編集ではfamily-chartを更新せず、戻ったときに一括反映する', () => {
    render(
      <FamilyTreeCanvas selectedPersonId={null} onSelectPerson={() => {}} />,
    )
    const chart = latestChart()

    fireEvent.click(screen.getByRole('button', { name: 'つながった全体表示' }))
    chart.updateTree.mockClear()
    chart.updateData.mockClear()

    act(() => {
      useTreeStore
        .getState()
        .apply((doc) => addPerson(doc, { name: { given: 'C' } }).doc)
    })

    // 非表示のfamily-chartへは何も指示しない
    expect(chart.updateData).not.toHaveBeenCalled()
    expect(chart.updateTree).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '折りたたみ表示' }))

    // 復帰時に最新データで一括反映される
    expect(chart.updateData).toHaveBeenCalledTimes(1)
    expect(chart.updateTree).toHaveBeenCalledTimes(1)
    expect(chart.updateTree).toHaveBeenLastCalledWith({ tree_position: 'fit' })
  })

  it('connectedへの切り替え自体でも隠れるだけのfamily-chartは更新しない', () => {
    render(
      <FamilyTreeCanvas selectedPersonId={null} onSelectPerson={() => {}} />,
    )
    const chart = latestChart()
    chart.updateTree.mockClear()
    chart.updateData.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'つながった全体表示' }))

    expect(chart.updateData).not.toHaveBeenCalled()
    expect(chart.updateTree).not.toHaveBeenCalled()
  })
})

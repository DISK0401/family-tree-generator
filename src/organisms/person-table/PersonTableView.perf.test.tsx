import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTreeDocument } from '../../domain/helpers'
import type { TreeDocument } from '../../domain/types'
import { useTreeStore } from '../../store/tree-store'
import { PersonTableView } from './PersonTableView'

/**
 * 大規模データでの描画・貼り付けの回帰監視(design.md D7)。
 * v1は行の仮想化を入れていないため、閾値を超える需要が出たときに気づけるよう
 * 緩い上限で計測する(絶対値の保証ではなく、桁が変わる劣化の検知が目的)。
 *
 * 規模は400人とする。1,000人(11,000セル)の描画はjsdomでは重く、テストファイルの
 * 並列実行で他ファイルのCPUを奪って無関係なタイムアウトを誘発したため、
 * 桁の劣化を検知できる範囲で抑えた(1,000人の実測値はdesign.mdに記録済み)。
 */
const PERSON_COUNT = 400

function buildLargeDocument(count: number): TreeDocument {
  const doc = createTreeDocument()
  for (let i = 0; i < count; i++) {
    const id = `p${i}`
    doc.persons[id] = {
      id,
      name: {
        surname: `姓${i % 100}`,
        given: `名${i}`,
        surnameKana: `せい${i % 100}`,
      },
      gender: i % 2 === 0 ? 'male' : 'female',
      birth: {
        type: 'birth',
        date: {
          original: `${1900 + (i % 120)}-01-01`,
          qualifier: 'exact',
          date: { year: 1900 + (i % 120), month: 1, day: 1 },
        },
      },
    }
  }
  return doc
}

/** clipboardDataを備えたpasteイベント(jsdomはClipboardEventを実装しない) */
function firePaste(target: Element, text: string) {
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', {
    value: { getData: () => text },
  })
  fireEvent(target, event)
}

describe('PersonTableView: 大規模データの性能(D7の回帰監視)', () => {
  beforeEach(() => {
    useTreeStore.getState().replace(buildLargeDocument(PERSON_COUNT))
  })

  it(
    `${PERSON_COUNT}人の表を現実的な時間で描画できる`,
    { timeout: 60_000 },
    () => {
      const start = performance.now()
      render(
        <PersonTableView selectedPersonId={null} onSelectPerson={() => {}} />,
      )
      const elapsedMs = performance.now() - start

      console.log(
        `[PersonTableView] ${PERSON_COUNT}人の描画時間: ${elapsedMs.toFixed(0)}ms`,
      )
      // ヘッダー2行(見出し・列ごとの絞り込み)+データ行
      expect(screen.getAllByRole('row')).toHaveLength(PERSON_COUNT + 2)
      expect(elapsedMs).toBeLessThan(15_000) // 回帰検知用の緩い上限(jsdomはブラウザより遅い)
    },
  )

  it('100行の貼り付けを1回のバッチで適用できる', { timeout: 60_000 }, () => {
    render(
      <PersonTableView selectedPersonId={null} onSelectPerson={() => {}} />,
    )
    fireEvent.click(screen.getByRole('button', { name: '編集' }))

    const tsv = Array.from({ length: 100 }, (_, i) => `貼付${i}\t名${i}`).join(
      '\r\n',
    )
    const grid = screen.getByRole('grid')
    const pastBefore = useTreeStore.getState().past.length

    const start = performance.now()
    firePaste(grid, tsv)
    const elapsedMs = performance.now() - start

    console.log(
      `[PersonTableView] 100行の貼り付け時間: ${elapsedMs.toFixed(0)}ms`,
    )
    // 1回のペースト=1件の履歴(undo 1回で戻せる)
    expect(useTreeStore.getState().past.length).toBe(pastBefore + 1)
    expect(
      Object.values(useTreeStore.getState().document.persons).filter((p) =>
        p.name.surname?.startsWith('貼付'),
      ),
    ).toHaveLength(100)
    expect(elapsedMs).toBeLessThan(10_000)
  })
})

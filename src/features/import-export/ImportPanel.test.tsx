import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ImportPanel } from './ImportPanel'
import { MAX_IMPORT_FILE_SIZE } from './fileIO'

function selectFile(file: File) {
  const input = screen.getByLabelText(
    '家系図ファイルを選択',
  ) as HTMLInputElement
  fireEvent.change(input, { target: { files: [file] } })
}

describe('ImportPanel', () => {
  it('有効なJSONファイルを選択するとonImportedが呼ばれる', async () => {
    const onImported = vi.fn()
    render(<ImportPanel onImported={onImported} />)

    const json = JSON.stringify({
      schemaVersion: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      people: [{ id: 'p1', name: { given: '太郎' } }],
      families: [],
    })
    const file = new File([json], 'family.json', { type: 'application/json' })

    selectFile(file)

    await waitFor(() => expect(onImported).toHaveBeenCalledTimes(1))
    const [data, summary] = onImported.mock.calls[0]
    expect(data.people).toHaveLength(1)
    expect(summary.format).toBe('json')
    expect(summary.peopleCount).toBe(1)
  })

  it('サイズ上限を超えるファイルは読み込み前にエラー表示し、onImportedを呼ばない', async () => {
    const onImported = vi.fn()
    render(<ImportPanel onImported={onImported} />)

    const oversized = new File(
      [new Uint8Array(MAX_IMPORT_FILE_SIZE + 1)],
      'huge.ged',
    )
    selectFile(oversized)

    expect(await screen.findByRole('alert')).toHaveTextContent('20MB')
    expect(onImported).not.toHaveBeenCalled()
  })

  it('対応していない拡張子はエラーメッセージを表示する', async () => {
    const onImported = vi.fn()
    render(<ImportPanel onImported={onImported} />)

    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' })
    selectFile(file)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '対応していないファイル形式',
    )
    expect(onImported).not.toHaveBeenCalled()
  })

  it('解釈できないGEDCOMファイルは失敗理由を表示する', async () => {
    const onImported = vi.fn()
    render(<ImportPanel onImported={onImported} />)

    const file = new File(['not a gedcom file'], 'broken.ged')
    selectFile(file)

    expect(await screen.findByRole('alert')).toHaveTextContent('HEAD')
    expect(onImported).not.toHaveBeenCalled()
  })
})

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTreeDocument } from '../domain/helpers'
import { addPerson } from '../domain/commands'
import { useTreeStore } from '../store/tree-store'
import { exportFamilyTreeJsonText } from '../lib/json/export'
import { ImportExportControl } from './ImportExportControl'
import { MAX_IMPORT_FILE_SIZE } from '../features/import-export/fileIO'

beforeEach(() => {
  useTreeStore.getState().replace(createTreeDocument())
  URL.createObjectURL = vi.fn(() => 'blob:mock-url')
  URL.revokeObjectURL = vi.fn()
})

function openDialog() {
  fireEvent.click(
    screen.getByRole('button', { name: 'GEDCOM/JSONの読み込み・書き出し' }),
  )
}

function selectFile(file: File) {
  const input = screen.getByLabelText(
    '家系図ファイルを選択',
  ) as HTMLInputElement
  fireEvent.change(input, { target: { files: [file] } })
}

describe('ImportExportControl', () => {
  it('ダイアログを開くと読み込み・書き出しのセクションが表示される', () => {
    render(<ImportExportControl />)
    openDialog()

    expect(screen.getByText('読み込む')).toBeInTheDocument()
    expect(screen.getByText('書き出す')).toBeInTheDocument()
    expect(screen.getByText('GEDCOM 7.0(推奨)')).toBeInTheDocument()
    expect(screen.getByText(/個人情報が含まれます/)).toBeInTheDocument()
  })

  it('空の家系図へJSONをインポートすると確認なしでストアへ反映される', async () => {
    render(<ImportExportControl />)
    openDialog()

    let document = createTreeDocument()
    document = addPerson(document, { name: { given: '太郎' } }).doc
    const file = new File([exportFamilyTreeJsonText(document)], 'family.json', {
      type: 'application/json',
    })

    selectFile(file)

    await waitFor(() => {
      expect(
        Object.keys(useTreeStore.getState().document.persons),
      ).toHaveLength(1)
    })
    expect(
      screen.getByText(/人物 1名・家族 0件を読み込みました/),
    ).toBeInTheDocument()
  })

  it('既存データがある状態でのインポートは確認ダイアログを経てから反映される', async () => {
    useTreeStore
      .getState()
      .replace(addPerson(createTreeDocument(), { name: { given: '既存' } }).doc)
    render(<ImportExportControl />)
    openDialog()

    let imported = createTreeDocument()
    imported = addPerson(imported, { name: { given: '新規' } }).doc
    const file = new File([exportFamilyTreeJsonText(imported)], 'family.json', {
      type: 'application/json',
    })

    selectFile(file)

    expect(await screen.findByText(/置き換えます/)).toBeInTheDocument()
    // 確認前はまだ既存データのまま
    expect(
      Object.values(useTreeStore.getState().document.persons).some(
        (p) => p.name.given === '既存',
      ),
    ).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: '置き換える' }))

    await waitFor(() => {
      expect(
        Object.values(useTreeStore.getState().document.persons).some(
          (p) => p.name.given === '新規',
        ),
      ).toBe(true)
    })
  })

  it('サイズ上限を超えるファイルは既存データを変えずエラー表示する', async () => {
    useTreeStore
      .getState()
      .replace(addPerson(createTreeDocument(), { name: { given: '既存' } }).doc)
    render(<ImportExportControl />)
    openDialog()

    const oversized = new File(
      [new Uint8Array(MAX_IMPORT_FILE_SIZE + 1)],
      'huge.ged',
    )
    selectFile(oversized)

    expect(await screen.findByRole('alert')).toHaveTextContent('20MB')
    expect(
      Object.values(useTreeStore.getState().document.persons).some(
        (p) => p.name.given === '既存',
      ),
    ).toBe(true)
  })

  it('エクスポートボタンはデータが無いと無効化され、データがあるとダウンロードが発生する', () => {
    render(<ImportExportControl />)
    openDialog()
    expect(screen.getByRole('button', { name: 'エクスポート' })).toBeDisabled()

    useTreeStore
      .getState()
      .replace(addPerson(createTreeDocument(), { name: { given: '太郎' } }).doc)
    // ストア更新はReactの再レンダリングを要するため、ダイアログを開き直して最新状態を反映する
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }))
    openDialog()

    expect(
      screen.getByRole('button', { name: 'エクスポート' }),
    ).not.toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'エクスポート' }))
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
  })
})

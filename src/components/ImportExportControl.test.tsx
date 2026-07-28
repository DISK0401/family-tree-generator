import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTreeDocument } from '../domain/helpers'
import { addPerson, addSpouse } from '../domain/commands'
import { useTreeStore } from '../store/tree-store'
import { exportFamilyTreeJsonText } from '../lib/json/export'
import { ImportExportControl } from './ImportExportControl'
import { MAX_IMPORT_FILE_SIZE } from '../features/import-export/fileIO'

const createObjectURLSpy = vi.fn(() => 'blob:mock-url')

beforeEach(() => {
  useTreeStore.getState().replace(createTreeDocument())
  createObjectURLSpy.mockClear()
  URL.createObjectURL = createObjectURLSpy
  URL.revokeObjectURL = vi.fn()
  // エクスポートはアンカーの click() でblobダウンロードを起動するが、jsdomはダウンロードを
  // 実装しておらず「Not implemented: navigation to another Document」警告を出すためスタブする
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})

function openDialog() {
  fireEvent.click(
    screen.getByRole('button', { name: 'GEDCOM/JSONの読み込み・書き出し' }),
  )
}

function selectFile(file: File) {
  const input = screen.getByLabelText('家系図ファイルを選択')
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

    // 置き換え確認はモーダル(alertdialog)として表示される
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      '置き換えます',
    )
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

  it('UTF-8として読めないJSONファイルはエラー表示され、取り込まれない(監査 中9)', async () => {
    render(<ImportExportControl />)
    openDialog()

    // 不正なUTF-8バイト列(単独の継続バイト等)
    const broken = new File(
      [new Uint8Array([0xff, 0xfe, 0x80, 0x81])],
      'broken.json',
      {
        type: 'application/json',
      },
    )
    selectFile(broken)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'ファイルをUTF-8として読み取れませんでした。UTF-8で保存し直してください。',
    )
    expect(Object.keys(useTreeStore.getState().document.persons)).toHaveLength(
      0,
    )
  })

  it('JSONの修復警告(参照切れの除去など)がサマリへ表示される', async () => {
    render(<ImportExportControl />)
    openDialog()

    let doc = createTreeDocument()
    const a = addPerson(doc, { name: { given: '太郎' } })
    doc = a.doc
    const spouse = addSpouse(doc, a.personId, { name: { given: '花子' } })
    doc = spouse.doc
    // 存在しない人物への子参照を仕込む(過去のエクスポートのダングリング参照を模す)
    const raw = JSON.parse(exportFamilyTreeJsonText(doc)) as {
      families: Record<string, { children: unknown[] }>
    }
    raw.families[spouse.familyId].children.push({
      childId: 'ghost',
      pedigree: 'biological',
    })
    const file = new File([JSON.stringify(raw)], 'family.json', {
      type: 'application/json',
    })

    selectFile(file)

    expect(await screen.findByText(/1件の警告があります/)).toBeInTheDocument()
    expect(
      screen.getByText(/存在しない人物 ghost への子参照を除去しました/),
    ).toBeInTheDocument()
    // 修復されたデータ自体は取り込まれている
    expect(Object.keys(useTreeStore.getState().document.persons)).toHaveLength(
      2,
    )
  })

  it('置き換え確認はモーダルで表示され、Escでキャンセルすると親ダイアログへ戻る(監査 高3)', async () => {
    useTreeStore
      .getState()
      .replace(addPerson(createTreeDocument(), { name: { given: '既存' } }).doc)
    render(<ImportExportControl />)
    openDialog()

    let imported = createTreeDocument()
    imported = addPerson(imported, { name: { given: '新規' } }).doc
    selectFile(
      new File([exportFamilyTreeJsonText(imported)], 'family.json', {
        type: 'application/json',
      }),
    )

    const confirm = await screen.findByRole('alertdialog')
    expect(confirm).toHaveAttribute('open')

    fireEvent.keyDown(confirm, { key: 'Escape' })

    // 確認だけが閉じ、親ダイアログは開いたまま。既存データは保持される
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByText('読み込む')).toBeInTheDocument()
    expect(
      Object.values(useTreeStore.getState().document.persons).some(
        (p) => p.name.given === '既存',
      ),
    ).toBe(true)
  })

  it('置き換え確認を残したまま親ダイアログを閉じると、保留インポートは明示的にキャンセルされる(監査 高3)', async () => {
    useTreeStore
      .getState()
      .replace(addPerson(createTreeDocument(), { name: { given: '既存' } }).doc)
    render(<ImportExportControl />)
    openDialog()

    let imported = createTreeDocument()
    imported = addPerson(imported, { name: { given: '新規' } }).doc
    selectFile(
      new File([exportFamilyTreeJsonText(imported)], 'family.json', {
        type: 'application/json',
      }),
    )
    await screen.findByRole('alertdialog')

    fireEvent.click(screen.getByRole('button', { name: '閉じる' }))

    // すべて閉じ、既存データが保持される(無言破棄ではなくキャンセル扱い)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(
      Object.values(useTreeStore.getState().document.persons).some(
        (p) => p.name.given === '既存',
      ),
    ).toBe(true)

    // 開き直しても保留中の確認は残っていない
    openDialog()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('importDisabled中はファイル選択が無効化され、理由が明示される', () => {
    render(<ImportExportControl importDisabled />)
    openDialog()

    expect(
      screen.getByText(/この状態では読み込んでも保存されません/),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('家系図ファイルを選択')).toBeDisabled()
    const dropzone = screen
      .getByText(/ドラッグ&ドロップ/)
      .closest('.import-dropzone')
    expect(dropzone).toHaveAttribute('aria-disabled', 'true')
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
    expect(createObjectURLSpy).toHaveBeenCalledTimes(1)
  })
})

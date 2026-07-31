import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTreeDocument } from './domain/helpers'
import type { TreeDocument } from './domain/types'
import {
  clearTreeDocument,
  loadTreeDocument,
  saveTreeDocument,
} from './persistence/db'
import { useTreeStore } from './store/tree-store'
import App from './App'

// 実装(fake-indexeddb)を活かしたまま、テストごとに失敗を注入できるようスパイ化する
vi.mock('./persistence/db', { spy: true })

beforeEach(async () => {
  // 前のテストの自動保存が残っていると、次のrenderの初期ロードがストアを上書きしてしまう
  await clearTreeDocument()
  useTreeStore.getState().replace(createTreeDocument())
})

describe('App', () => {
  it('画面骨格(ヘッダ・キャンバス)が表示され、保存先が端末内であることが明示される', async () => {
    render(<App />)
    expect(
      screen.getByRole('heading', { name: '家系図帖' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('main', { name: '家系図キャンバス' }),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText(/この端末にのみ保存されます/)).toBeInTheDocument()
    })
  })

  it('人物ゼロの状態では空状態ガイドが表示される', async () => {
    render(<App />)
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: '家系図をはじめる' }),
      ).toBeInTheDocument()
    })
  })

  it('空状態ガイドから最初の人物を追加すると、ガイドが消えデータに反映され、その人物が選択される', async () => {
    render(<App />)
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: '家系図をはじめる' }),
      ).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText('姓'), { target: { value: '山田' } })
    fireEvent.change(screen.getByLabelText('名'), { target: { value: '太郎' } })
    fireEvent.click(screen.getByRole('button', { name: '最初の人物を追加' }))

    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: '家系図をはじめる' }),
      ).not.toBeInTheDocument()
    })
    expect(
      Object.values(useTreeStore.getState().document.persons),
    ).toHaveLength(1)
    // 追加した人物が選択され、編集パネルが開く(監査 低11)
    expect(
      screen.getByRole('heading', { name: '山田 太郎' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '確定' })).toBeInTheDocument()
  })

  it('永続ストレージが保証されない環境では控えめな注意書きが表示される', async () => {
    // jsdomにはnavigator.storageが無い = persist()未対応環境として扱われる
    render(<App />)
    expect(
      await screen.findByText(/定期的なエクスポートをおすすめします/),
    ).toBeInTheDocument()
  })
})

describe('App: 保存できない状態の表示(監査: 新PersistenceStatus対応)', () => {
  it('保存データの読み込みに失敗すると案内が表示され、編集UIが出ない(unavailable: load-failed)', async () => {
    vi.mocked(loadTreeDocument).mockRejectedValueOnce(
      new Error('IndexedDB open failed'),
    )
    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '保存データを読み込めませんでした。再読み込みするか、すべてのデータを削除してやり直せます。',
    )
    // 編集UI(空状態ガイド・キャンバス)は表示されない
    expect(
      screen.queryByRole('heading', { name: '家系図をはじめる' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '人物を追加' }),
    ).not.toBeInTheDocument()
  })

  it('保存に失敗すると再試行ボタンとエクスポート退避の案内が出て、再試行で回復する(saveState: error)', async () => {
    vi.mocked(saveTreeDocument).mockRejectedValueOnce(
      new Error('QuotaExceededError'),
    )
    render(<App />)
    await screen.findByRole('heading', { name: '家系図をはじめる' })

    // 人物を追加して自動保存(デバウンス800ms)をトリガーする
    fireEvent.change(screen.getByLabelText('名'), { target: { value: '太郎' } })
    fireEvent.click(screen.getByRole('button', { name: '最初の人物を追加' }))

    expect(
      await screen.findByText('保存に失敗しました', undefined, {
        timeout: 3000,
      }),
    ).toBeInTheDocument()
    const errorNote = screen.getByRole('alert')
    expect(errorNote).toHaveTextContent('エクスポートで退避できます')

    fireEvent.click(screen.getByRole('button', { name: '再試行' }))

    expect(
      await screen.findByText(/保存済み/, undefined, { timeout: 3000 }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '再試行' }),
    ).not.toBeInTheDocument()
  })
})

describe('App: 未保存の変更がある状態での移動確認(監査 中13)', () => {
  function docWithUnconnectedPersons(): TreeDocument {
    const doc = createTreeDocument()
    doc.persons['a'] = { id: 'a', name: { given: 'A' }, gender: 'unknown' }
    doc.persons['b'] = { id: 'b', name: { given: 'B' }, gender: 'unknown' }
    doc.persons['c'] = { id: 'c', name: { given: 'C' }, gender: 'unknown' }
    return doc
  }

  /** 人物Bを選択し、名を書き換えてダーティ状態にする */
  async function selectBAndDirty() {
    useTreeStore.getState().replace(docWithUnconnectedPersons())
    render(<App />)
    // 「図に現れていない人物」のチップ(B・C)はready後に現れる
    fireEvent.click(await screen.findByRole('button', { name: 'B' }))
    const givenInput = screen.getByLabelText('名', { exact: true })
    expect(givenInput).toHaveValue('B')
    fireEvent.change(givenInput, { target: { value: 'B2' } })
    return givenInput
  }

  it('ダーティ状態で別人物を選ぶと3択の確認が出る。「編集を続ける」で選択も入力も保たれる', async () => {
    const givenInput = await selectBAndDirty()

    fireEvent.click(screen.getByRole('button', { name: 'C' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('保存されていない変更があります')

    fireEvent.click(
      within(dialog).getByRole('button', { name: '編集を続ける' }),
    )

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    // 選択はBのまま、入力値も保持される
    expect(screen.getByRole('heading', { name: 'B' })).toBeInTheDocument()
    expect(givenInput).toHaveValue('B2')
    expect(useTreeStore.getState().document.persons['b'].name.given).toBe('B')
  })

  it('「変更を破棄して移動する」で保存せずに移動先へ切り替わる', async () => {
    await selectBAndDirty()

    fireEvent.click(screen.getByRole('button', { name: 'C' }))
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(
      within(dialog).getByRole('button', { name: '変更を破棄して移動する' }),
    )

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'C' })).toBeInTheDocument()
    // 破棄なのでBの氏名は変わらない
    expect(useTreeStore.getState().document.persons['b'].name.given).toBe('B')
  })

  it('「保存して移動する」で変更を確定してから移動先へ切り替わる', async () => {
    await selectBAndDirty()

    fireEvent.click(screen.getByRole('button', { name: 'C' }))
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(
      within(dialog).getByRole('button', { name: '保存して移動する' }),
    )

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'C' })).toBeInTheDocument()
    expect(useTreeStore.getState().document.persons['b'].name.given).toBe('B2')
  })

  it('パネルを閉じる操作(移動先null)もダーティ中は確認対象になる(undefined/nullの区別)', async () => {
    await selectBAndDirty()

    fireEvent.click(screen.getByRole('button', { name: 'パネルを閉じる' }))
    const dialog = await screen.findByRole('alertdialog')

    fireEvent.click(
      within(dialog).getByRole('button', { name: '変更を破棄して移動する' }),
    )

    // 移動先がnull = パネルが閉じる(どの人物の見出しも出ない)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'B' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '確定' }),
    ).not.toBeInTheDocument()
    expect(useTreeStore.getState().document.persons['b'].name.given).toBe('B')
  })

  it('ダーティでなければ確認なしで移動する', async () => {
    useTreeStore.getState().replace(docWithUnconnectedPersons())
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'B' }))
    expect(screen.getByRole('heading', { name: 'B' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'パネルを閉じる' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'B' })).not.toBeInTheDocument()
  })
})

describe('図 / 表のビュー切替(spec person-table-editor「表形式ビューと図の切り替え」)', () => {
  function docWithPersons(): TreeDocument {
    const doc = createTreeDocument()
    doc.persons['a'] = {
      id: 'a',
      name: { surname: '山田', given: '太郎' },
      gender: 'male',
    }
    doc.persons['b'] = {
      id: 'b',
      name: { surname: '佐藤', given: '花子' },
      gender: 'female',
    }
    return doc
  }

  it('表へ切り替えると人物一覧が表示され、データは変化しない', async () => {
    useTreeStore.getState().replace(docWithPersons())
    render(<App />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '表' })).toBeInTheDocument()
    })
    const before = useTreeStore.getState().document

    fireEvent.click(screen.getByRole('button', { name: '表' }))

    expect(screen.getByRole('grid', { name: '人物の一覧' })).toBeInTheDocument()
    expect(screen.getByRole('main', { name: '人物一覧' })).toBeInTheDocument()
    expect(useTreeStore.getState().document).toBe(before)
  })

  it('表モードでは編集パネルを表示しない(属性編集は表が担う)', async () => {
    useTreeStore.getState().replace(docWithPersons())
    render(<App />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '表' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '表' }))

    // 行を選んでもパネル(complementary)は現れない
    fireEvent.click(screen.getAllByRole('gridcell')[0])
    const panel = screen.getByLabelText('編集パネル')
    expect(panel).toHaveAttribute('hidden')
  })

  it('人物ゼロの状態ではビュー切替を出さない(表にする対象がない)', async () => {
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText(/この端末にのみ保存されます/)).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: '表' })).not.toBeInTheDocument()
  })

  it('保存できない状態では表・ビュー切替を表示しない(spec「既存の編集経路との等価性」)', async () => {
    // 読み込み失敗(unavailable)を注入する。blocked / stale も同じく ready ではないため
    // 表・図・パネルはいずれも描画されない(Appの ready ゲートで一括して守られる)
    vi.mocked(loadTreeDocument).mockRejectedValueOnce(new Error('boom'))
    useTreeStore.getState().replace(docWithPersons())
    render(<App />)

    await waitFor(() => {
      // 同じ文言はヘッダーの状態表示と本文の警告の2箇所に出る(既存仕様)
      expect(
        screen.getAllByText(/保存データを読み込めませんでした/).length,
      ).toBeGreaterThan(0)
    })
    expect(screen.queryByRole('button', { name: '表' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('grid', { name: '人物の一覧' }),
    ).not.toBeInTheDocument()
  })
})

describe('表の編集が自動保存に乗る(spec person-table-editor「既存の編集経路との等価性」)', () => {
  it('セル編集の確定で保存済みになり、リロード相当の再マウントで復元される', async () => {
    const doc = createTreeDocument()
    doc.persons['a'] = {
      id: 'a',
      name: { surname: '山田', given: '太郎' },
      gender: 'male',
    }
    useTreeStore.getState().replace(doc)
    const { unmount } = render(<App />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '表' })).toBeInTheDocument()
    })

    // 表の編集モードで姓を書き換える
    fireEvent.click(screen.getByRole('button', { name: '表' }))
    fireEvent.click(screen.getByRole('button', { name: '編集' }))
    fireEvent.doubleClick(screen.getByRole('gridcell', { name: '山田' }))
    const input = screen.getByRole('textbox', { name: '姓' })
    fireEvent.change(input, { target: { value: '渡辺' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    // 自動保存(デバウンス)の完了がヘッダーに現れる
    await waitFor(() => {
      expect(screen.getByText(/保存済み/)).toBeInTheDocument()
    })

    // リロード相当: ストアを空にしてから再マウントし、IndexedDBから復元されることを見る
    unmount()
    useTreeStore.getState().replace(createTreeDocument())
    render(<App />)

    await waitFor(() => {
      expect(
        Object.values(useTreeStore.getState().document.persons).some(
          (p) => p.name.surname === '渡辺',
        ),
      ).toBe(true)
    })
  })
})

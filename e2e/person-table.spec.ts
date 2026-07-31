import { test, expect } from '@playwright/test'

/**
 * 人物一覧の表形式ビューと Excel ライク編集モード(spec person-table-editor)。
 * jsdom では ClipboardEvent を実装できないため、**実ブラウザでの貼り付けが
 * 期待どおり反映されること**はこの E2E だけが守っている。
 */
test('表の編集モードでTSVを貼り付けると、人物が一括で追加され図にも現れる', async ({
  page,
  context,
}) => {
  // クリップボードへの書き込み許可(貼り付け元データの用意に使う)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/app')

  // 空状態から最初の人物を追加して、表ビューの導線を出す
  await page.getByRole('textbox', { name: '姓' }).fill('山田')
  await page.getByRole('textbox', { name: '名' }).fill('太郎')
  await page.getByRole('button', { name: '最初の人物を追加' }).click()
  await expect(page.locator('.tree-card').first()).toBeVisible()

  // 表へ切り替える
  await page.getByRole('button', { name: '表', exact: true }).click()
  const grid = page.getByRole('grid', { name: '人物の一覧' })
  await expect(grid).toBeVisible()
  await expect(grid.getByRole('gridcell', { name: '山田' })).toBeVisible()

  // 編集モードへ入り、起点セル(1行目の姓)を選ぶ
  await page.getByRole('button', { name: '編集', exact: true }).click()
  await grid.getByRole('gridcell', { name: '山田' }).click()

  // 表計算ソフトからのコピーに相当するTSVをクリップボードへ入れて貼り付ける。
  // navigator.clipboard はこのtsconfig(node向けlib)の型に含まれないため、
  // ページ内で使う分の最小の形だけを宣言して参照する
  await page.evaluate(async (text: string) => {
    const nav = navigator as unknown as {
      clipboard: { writeText: (value: string) => Promise<void> }
    }
    await nav.clipboard.writeText(text)
  }, '渡辺\t一郎\r\n鈴木\t二郎\r\n田中\t三郎')
  await page.keyboard.press('Control+V')

  // 1行目は更新、超過2行は新規人物として追加される(合計3人)
  await expect(grid.getByRole('gridcell', { name: '渡辺' })).toBeVisible()
  await expect(grid.getByRole('gridcell', { name: '鈴木' })).toBeVisible()
  await expect(grid.getByRole('gridcell', { name: '田中' })).toBeVisible()

  // 図へ戻ると、貼り付けで追加された人物がカードとして現れる。
  // 追加された人物は互いに関係を持たないため、既定の折りたたみ表示では1人しか
  // 図に出ない(残りは「図に現れていない人物」の一覧に並ぶ)。全員が図に現れる
  // 「つながった全体表示」で確認する
  await page.getByRole('button', { name: '図', exact: true }).click()
  await page.getByRole('button', { name: 'つながった全体表示' }).click()
  // 折りたたみ表示のfamily-chartはDOMに残る(非表示)ため、つながった全体表示側の
  // カード(.pedigree-card)に限定して数える
  await expect(page.locator('.pedigree-card')).toHaveCount(3)

  // 自動保存されており、リロードしても保持される
  await expect(page.getByText(/保存済み/)).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'つながった全体表示' }).click()
  await expect(page.locator('.pedigree-card')).toHaveCount(3)
})

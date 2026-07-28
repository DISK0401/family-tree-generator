import { test, expect } from '@playwright/test'

/**
 * IndexedDB 自動保存とリロード復元の実ブラウザ検証。
 * jsdom では fake-indexeddb を使うため、実ブラウザの IndexedDB での往復は
 * この E2E だけが守っている。
 */
test('人物を追加してリロードすると、編集内容が復元される', async ({ page }) => {
  await page.goto('/app')

  // 空状態ガイドから最初の人物を追加する(氏名を入れるまでボタンは無効)
  await page.getByRole('textbox', { name: '姓' }).fill('山田')
  await page.getByRole('textbox', { name: '名' }).fill('太郎')
  await page.getByRole('button', { name: '最初の人物を追加' }).click()
  await expect(page.locator('.tree-card').first()).toBeVisible()

  // デバウンス(800ms)を経た自動保存の完了を待ってからリロードする
  await expect(page.getByText(/保存済み/)).toBeVisible()

  await page.reload()

  // 復元完了後、空状態ガイドではなく追加した人物のカードが表示される
  await expect(page.locator('.tree-card').first()).toBeVisible()
  await expect(page.locator('.tree-card').first()).toContainText('山田')
  await expect(page.getByText('この端末にのみ保存されます')).toBeVisible()
})

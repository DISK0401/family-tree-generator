import { test, expect, type Page } from '@playwright/test'

/**
 * 「家系図データ・個人情報を一切サーバーへ送信しない」(README・openspec/config.yaml の
 * 絶対制約)を実ブラウザで検証する。ページが発行する全リクエスト(フォント・スクリプト・
 * XHR/fetch を含む)が自オリジンであることをアサートする。
 * 本番では CSP(worker/index.ts の connect-src 'self' 等)が同じ制約を強制するが、
 * この E2E は「そもそも外部リクエストを発行しない」ことを開発時点で回帰検知する。
 */
const DEV_SERVER_HOSTS = new Set(['127.0.0.1:5173', 'localhost:5173'])

function watchExternalRequests(page: Page): string[] {
  const external: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    // 開発サーバのホスト以外への通信はプロトコル(http/ws)を問わず全て「外部」とみなす
    if (!DEV_SERVER_HOSTS.has(url.host)) {
      external.push(request.url())
    }
  })
  return external
}

test('ランディングページは外部へリクエストを一切発行しない', async ({
  page,
}) => {
  const external = watchExternalRequests(page)

  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: /家系図/ }).first(),
  ).toBeVisible()
  // フォント読込(遅延適用)まで含めて観測するため、ネットワークが静穏になるのを待つ
  await page.waitForLoadState('networkidle')

  expect(external).toEqual([])
})

test('エディタでの人物追加・編集操作でも外部へリクエストを発行しない', async ({
  page,
}) => {
  const external = watchExternalRequests(page)

  await page.goto('/app')
  // 空状態ガイドから最初の人物を追加する(氏名を入れるまでボタンは無効)
  await page.getByRole('textbox', { name: '姓' }).fill('山田')
  await page.getByRole('textbox', { name: '名' }).fill('太郎')
  await page.getByRole('button', { name: '最初の人物を追加' }).click()
  // 追加した人物のカードが描画され、自動保存が完了するまで待つ
  await expect(page.locator('.tree-card').first()).toBeVisible()
  await expect(page.getByText(/保存済み/)).toBeVisible()
  await page.waitForLoadState('networkidle')

  expect(external).toEqual([])
})

test('サンプル読み込みでも外部へリクエストを発行しない', async ({ page }) => {
  const external = watchExternalRequests(page)

  await page.goto('/app?sample=tokugawa-ieyasu')
  // サンプル人物のカードが現れる(= 動的 import のチャンクも自オリジンから解決された)
  await expect(page.locator('.tree-card').first()).toBeVisible()
  await page.waitForLoadState('networkidle')

  expect(external).toEqual([])
})

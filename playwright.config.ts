import { defineConfig, devices } from '@playwright/test'

// 社内プロキシ環境で webServer の readiness チェックが localhost をプロキシ経由に
// しないようにする(プロキシの応答を「起動済み」と誤認したり、逆に到達不能になるため)
process.env.NO_PROXY = [process.env.NO_PROXY, '127.0.0.1', 'localhost']
  .filter(Boolean)
  .join(',')

/**
 * 実ブラウザでのスモークテスト。jsdom では検証できない2点を守る:
 * 1. 「外部送信ゼロ」(製品の中核の約束)— 全リクエストが自オリジンであること
 * 2. IndexedDB 永続化のリロード復元
 * 開発サーバ(vite dev)に対して実行する。Worker のヘッダ類は worker/index.test.ts が担う。
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  /*
   * expect の待ち時間(既定5秒)を延ばす。複数のブラウザを並列に走らせるため、
   * サンプルの動的import+初回描画のような重い経路が5秒に収まらず、本質的な問題なしに
   * 断続的に失敗していた。成功時の速度には影響しない(条件が満たされ次第すぐ進む)
   */
  expect: { timeout: 15_000 },
  use: {
    // Vite の `localhost` は環境により IPv6([::1])のみで LISTEN し、ブラウザの
    // IPv4 解決と食い違って ERR_CONNECTION_REFUSED になるため、IPv4 を明示する
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // システムプロキシが設定された環境でも localhost の開発サーバへ直接つなぐ
        // (プロキシ経由だと ERR_CONNECTION_REFUSED になる)。CIでは無害
        launchOptions: { args: ['--no-proxy-server'] },
      },
    },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})

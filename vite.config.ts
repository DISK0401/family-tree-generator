import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    globals: true,
    /*
     * 既定の5秒はjsdomのコンポーネントテストには短い。ファイル並列実行のCPU競合で、
     * 実タイマー待ち(自動保存のデバウンス等)を含むテストが本質的な問題なしに
     * タイムアウトすることがあったため、余裕を持たせる(遅いCI機でも同様)。
     * 個別に長い上限が必要なテストは、そのテスト側で timeout を指定する
     */
    testTimeout: 20_000,
    // e2e/ は Playwright(実ブラウザ)のテスト。Vitest には拾わせない
    exclude: [...configDefaults.exclude, 'e2e/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**', 'worker/**'],
      exclude: [
        'src/test/**',
        '**/*.test.*',
        'src/**/test-fixtures.ts',
        'src/**/test-invariants.ts',
        // 静的データ(サンプル4種)。ロジックを含まないため計測対象から外す
        'src/samples/data/**',
      ],
      reporter: ['text-summary', 'html', 'lcov'],
    },
  },
})

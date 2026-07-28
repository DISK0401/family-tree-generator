import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    globals: true,
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

import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import prettierConfig from 'eslint-config-prettier'

export default tseslint.config(
  // spike/ は検証済みスパイクとして凍結(型検査対象外・非保守。spike/README.md 参照)
  { ignores: ['dist', 'spike'] },
  {
    extends: [
      js.configs.recommended,
      // type-aware ルールを有効にする。IndexedDB自動保存・動的import・ファイル入出力と
      // async だらけのアプリなので、no-floating-promises / no-misused-promises が
      // 「awaitし忘れ=保存されたつもりで保存されていない」系の欠陥を静的に検出する
      ...tseslint.configs.recommendedTypeChecked,
      prettierConfig,
    ],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...reactRefresh.configs.vite.rules,
    },
  },
)

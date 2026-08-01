import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import prettierConfig from 'eslint-config-prettier'

/** organisms/ の機能ディレクトリ一覧(機能間の直接依存を禁じるルールの生成に使う) */
const ORGANISM_FEATURES = [
  'person-edit',
  'person-table',
  'import-export',
  'tree-canvas',
  'settings',
  'onboarding',
]

export default tseslint.config(
  // spike/ は検証済みスパイクとして凍結(型検査対象外・非保守。spike/README.md 参照)。
  // coverage/ は `npm run test:coverage` の生成物(gitignore済みだがローカルのlintが拾ってしまう)
  { ignores: ['dist', 'spike', 'coverage'] },
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

  /*
   * UI層の依存規則(spec ui-component-layers)。
   *
   * 層の所属は「見た目の複雑さ」ではなく **依存の向き** で決まる(design.md D1)。
   * 主観の入る余地を残さないよう、境界を import で機械判定する。
   * ここが緩むと components/ のフラットな置き場へ逆戻りするため、CIの必須チェックで守る。
   *
   * 依存は必ず下向き: pages -> templates -> organisms -> molecules -> atoms。
   * atoms/molecules が store や通信層を知らないことは、無料版の「外部送信ゼロ」に対する
   * 構造上の防波堤にもなる(送信コードが混入しうる場所を organisms 以下に限定する)。
   */
  {
    files: ['src/atoms/**/*.{ts,tsx}'],
    ignores: ['src/atoms/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/domain/*',
                '**/store/*',
                '**/persistence/*',
                '**/lib/**',
                '**/layout/*',
              ],
              message:
                'atoms はドメイン・状態・入出力を知らない層です(design.md D1)。ドメイン語彙を持つ部品は molecules/ へ置いてください。',
            },
            {
              group: [
                '**/molecules/*',
                '**/organisms/**',
                '**/templates/*',
                '**/pages/**',
              ],
              message:
                '下位層は上位層を参照しません。共通化したい振る舞いは atoms 側へ引き出してください。',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/molecules/**/*.{ts,tsx}'],
    ignores: ['src/molecules/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/store/*', '**/persistence/*'],
              message:
                'molecules は状態を購読しません(props で受けてください。design.md D1)。ストアを読む必要がある部品は organisms/<機能>/ へ置きます。',
            },
            {
              group: ['**/organisms/**', '**/templates/*', '**/pages/**'],
              message:
                '下位層は上位層を参照しません。共通化したい部品は molecules 側へ引き出してください。',
            },
          ],
        },
      ],
    },
  },
  /*
   * 機能間の直接依存を禁じる(design.md D2)。
   * organisms/<機能A> から organisms/<機能B> を直接参照すると、機能の境界が溶けて
   * 「1つの機能を読むには全機能を読む」状態へ戻る。共有が必要になった部品は
   * molecules/ へ昇格させる(昇格条件は「機能をまたいで2箇所以上」= D6)。
   *
   * NOTE: no-restricted-imports が照合するのは**解決後のパスではなく指定子の文字列**。
   * 隣の機能は `../tree-canvas/...` という相対形で書かれるため、organisms 配下を
   * ワイルドカードで束ねた指定では捕まらない。兄弟機能の名前を列挙して
   * 相対形・絶対形の両方の書き方を塞ぐ。
   */
  ...ORGANISM_FEATURES.map((feature) => {
    const others = ORGANISM_FEATURES.filter((f) => f !== feature)
    return {
      files: [`src/organisms/${feature}/**/*.{ts,tsx}`],
      // テストは機能をまたいだ組み立て(実物を差し込んだ統合の検証)を行ってよい
      ignores: [`src/organisms/${feature}/**/*.test.{ts,tsx}`],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: others.flatMap((other) => [
                  `../${other}`,
                  `../${other}/**`,
                  `**/organisms/${other}`,
                  `**/organisms/${other}/**`,
                ]),
                message:
                  '機能をまたぐ直接の参照は禁止です(design.md D2)。共有したい部品は molecules/ へ昇格させてください。',
              },
            ],
          },
        ],
      },
    }
  }),
)

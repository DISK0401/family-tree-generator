import { describe, expect, it } from 'vitest'

/**
 * レイアウタは描画ライブラリ(family-chart)にもReact/DOMにも依存しない純粋な計算でなければならない
 * (design.md D2: 「PedigreeLayoutはDOMにも描画ライブラリにも依存しないプレーンなデータ」)。
 * `src/layout`配下の実装ファイルすべてを走査し、禁止されたimport元が使われていないことを機械的に確認する。
 * Node組み込みモジュール(fs等)はブラウザ向けの`tsconfig.app.json`の型定義に含まれないため、
 * Viteの`import.meta.glob`でソースをテキストとして取り込む
 */
const sourceFiles = import.meta.glob('./*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
})

describe('src/layout の依存境界', () => {
  it('family-chart / react / DOM 型を import していない', () => {
    const files = Object.keys(sourceFiles)
    expect(files.length).toBeGreaterThan(0)

    const forbidden = [
      /from\s+['"]family-chart/,
      /from\s+['"]react/,
      /from\s+['"]react-dom/,
    ]

    for (const file of files) {
      const content = sourceFiles[file]
      for (const pattern of forbidden) {
        expect(content, `${file} に禁止されたimportが含まれている`).not.toMatch(
          pattern,
        )
      }
    }
  })

  it('rendering / components / store / settings への相対 import を持たない', () => {
    // レイアウタは rendering → layout の一方向でしか参照されない(coordinates.tsのCARD_SIZEの
    // コメントが主張する検査の実体)。アプリ側の層への相対importが紛れ込むと、レイアウト計算が
    // 画面の実装へ引きずられ、印刷・PDF出力と結果を共有できなくなる
    const files = Object.keys(sourceFiles)
    expect(files.length).toBeGreaterThan(0)

    const forbidden = /from\s+['"]\.\.\/(rendering|components|store|settings)/

    for (const file of files) {
      expect(
        sourceFiles[file],
        `${file} にアプリ側の層への相対importが含まれている`,
      ).not.toMatch(forbidden)
    }
  })
})

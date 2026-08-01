import { describe, expect, it } from 'vitest'

/*
 * vitestのCSSスタブ(css: false相当)に吸われないよう、?rawではなくfsで実ファイルを読む。
 * tsconfig.app.jsonのtypesは["vite/client"]のみでnodeの型解決ができないため、
 * 指定子を変数にした動的importで型チェックを迂回する(実行環境はvitest=Nodeで本物が解決される)。
 * jsdom環境ではimport.meta.urlがfileスキームにならないため、cwd(プロジェクトルート)基準で解決する
 */
const nodeFsSpecifier = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFsSpecifier)) as {
  readFileSync: (path: string, encoding: 'utf8') => string
}
const cwd = (
  globalThis as unknown as { process: { cwd(): string } }
).process.cwd()

const tokensCss = readFileSync(`${cwd}/src/styles/tokens.css`, 'utf8')

/**
 * デザイントークンのコントラスト回帰テスト(監査 中8)。
 * 補助テキスト(--ink-faint)が主要な紙面(--paper / --paper-raised)に対して
 * WCAG AA(4.5:1)を割る値へ退行しないよう、tokens.cssの実値から検証する。
 */

function relativeLuminance(hex: string): number {
  const value = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map(
    (i) => parseInt(value.slice(i, i + 2), 16) / 255,
  )
  const linear = (c: number) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  )
  return (lighter + 0.05) / (darker + 0.05)
}

function getVar(block: string, name: string): string {
  const match = block.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!match) throw new Error(`${name} が見つからない`)
  return match[1]
}

/** tokens.cssをライト定義・OSダーク定義・明示ダーク定義の3ブロックへ分割する */
function splitThemeBlocks(css: string): {
  light: string
  mediaDark: string
  attrDark: string
} {
  const mediaStart = css.indexOf('@media (prefers-color-scheme: dark)')
  const attrDarkStart = css.indexOf(":root[data-theme='dark']")
  if (mediaStart < 0 || attrDarkStart < 0 || attrDarkStart < mediaStart) {
    throw new Error('tokens.cssのテーマ構造が想定と異なる')
  }
  return {
    light: css.slice(0, mediaStart),
    mediaDark: css.slice(mediaStart, attrDarkStart),
    attrDark: css.slice(attrDarkStart),
  }
}

describe('tokens.css: --ink-faint のコントラスト(監査 中8)', () => {
  const { light, mediaDark, attrDark } = splitThemeBlocks(tokensCss)

  it('ライトテーマでAA(4.5:1)以上ある', () => {
    const inkFaint = getVar(light, '--ink-faint')
    expect(
      contrastRatio(inkFaint, getVar(light, '--paper')),
    ).toBeGreaterThanOrEqual(4.5)
    expect(
      contrastRatio(inkFaint, getVar(light, '--paper-raised')),
    ).toBeGreaterThanOrEqual(4.5)
  })

  it('ダークテーマでAA(4.5:1)以上ある', () => {
    const inkFaint = getVar(mediaDark, '--ink-faint')
    expect(
      contrastRatio(inkFaint, getVar(mediaDark, '--paper')),
    ).toBeGreaterThanOrEqual(4.5)
    expect(
      contrastRatio(inkFaint, getVar(mediaDark, '--paper-raised')),
    ).toBeGreaterThanOrEqual(4.5)
  })

  it('OS設定由来のダークと明示指定のダークで同じ値が定義されている(二重定義の同期。監査 低12)', () => {
    for (const name of [
      '--ink-faint',
      '--ink',
      '--ink-soft',
      '--paper',
      '--paper-raised',
    ]) {
      expect(getVar(attrDark, name)).toBe(getVar(mediaDark, name))
    }
  })
})

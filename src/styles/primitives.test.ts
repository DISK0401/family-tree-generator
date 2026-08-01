import { describe, expect, it } from 'vitest'

/*
 * vitestのCSSスタブ(css: false相当)に吸われないよう、?rawではなくfsで実ファイルを読む。
 * tsconfig.app.jsonのtypesは["vite/client"]のみでnodeの型解決ができないため、
 * 指定子を変数にした動的importで型チェックを迂回する(実行環境はvitest=Nodeで本物が解決される)。
 * jsdom環境ではimport.meta.urlがfileスキームにならないため、cwd(プロジェクトルート)基準で解決する
 */
const nodeFsSpecifier = 'node:fs'
const nodePathSpecifier = 'node:path'
const { readFileSync, readdirSync } = (await import(
  /* @vite-ignore */ nodeFsSpecifier
)) as {
  readFileSync: (path: string, encoding: 'utf8') => string
  readdirSync: (
    path: string,
    options: { withFileTypes: true },
  ) => { name: string; isDirectory: () => boolean }[]
}
const { join } = (await import(/* @vite-ignore */ nodePathSpecifier)) as {
  join: (...parts: string[]) => string
}
const cwd = (
  globalThis as unknown as { process: { cwd(): string } }
).process.cwd()

/**
 * 見た目の基本形が `styles/primitives.css` の外へ散らないことの回帰テスト
 * (spec ui-component-layers「見た目の基本形の単一情報源」)。
 *
 * 「操作要素の基本形」を `cursor: pointer` と `border-radius` と `padding` の
 * **同時指定**で定義する。この3つが揃ったルールは、押せる要素の形そのものを
 * 決めているため基本形に属する。1つ2つだけの指定(角丸だけのバッジ、余白だけの
 * レイアウト等)は差分として各所に残ってよいので検出しない。
 */

/** 基本形の定義そのもの。ここだけは操作要素の形を持ってよい */
const PRIMITIVES = 'src/styles/primitives.css'

/**
 * 検出から除く例外。追加するときは理由を必ず書く(レビューで見えるようにするため、
 * ここに列挙する以外の抜け道を作らない)。
 */
const EXCEPTIONS: { file: string; selector: string; reason: string }[] = [
  {
    file: 'src/organisms/tree-canvas/person-card.css',
    selector: '.tree-card',
    reason:
      '人物カードは person-card.ts が生成するHTML文字列で、クラスは person-card.test.ts が' +
      '完全一致で検証しているため .surface--raised を当てられない(design.md 付録A)。' +
      '値はトークンで基本形と揃えている',
  },
  {
    file: 'src/organisms/tree-canvas/person-card.css',
    selector: '.tree-card-hidden-badge',
    reason: '同上(カードのマークアップはHTML文字列側の定数)',
  },
  {
    file: 'src/molecules/PersonPicker.css',
    selector: '.person-picker-option',
    reason:
      'listboxの選択肢(li)であってボタンではない。role="option" の行として ' +
      'PersonPicker 内で完結する',
  },
  {
    file: 'src/organisms/import-export/ImportExportControl.css',
    selector: '.import-dropzone',
    reason:
      'ファイルのドロップ領域。押せる面ではあるがボタンの語彙(枠+面+文字)ではなく' +
      '破線の受け皿として独立した形を持つ',
  },
]

function listCssFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(join(cwd, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) out.push(...listCssFiles(rel))
    else if (entry.name.endsWith('.css')) out.push(rel)
  }
  return out
}

/** ルール単位(セレクタ + 宣言ブロック)へ雑に分解する。@media 等のネストは中身だけを見る */
function eachRule(css: string): { selector: string; body: string }[] {
  const rules: { selector: string; body: string }[] = []
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const re = /([^{}]+)\{([^{}]*)\}/g
  let match: RegExpExecArray | null
  while ((match = re.exec(withoutComments)) !== null) {
    rules.push({ selector: match[1].trim(), body: match[2] })
  }
  return rules
}

function definesControlBaseForm(body: string): boolean {
  return (
    /cursor:\s*pointer/.test(body) &&
    /border-radius:/.test(body) &&
    /padding:/.test(body)
  )
}

describe('見た目の基本形の単一情報源', () => {
  const cssFiles = listCssFiles('src').filter((f) => f !== PRIMITIVES)

  it('primitives.css 以外の CSS が操作要素の基本形を定義していない', () => {
    const offenders: string[] = []
    for (const file of cssFiles) {
      const css = readFileSync(join(cwd, file), 'utf8')
      for (const rule of eachRule(css)) {
        if (!definesControlBaseForm(rule.body)) continue
        const excepted = EXCEPTIONS.some(
          (e) => e.file === file && rule.selector.includes(e.selector),
        )
        if (!excepted) offenders.push(`${file}: ${rule.selector}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('操作要素・入力・面・切替の基本形は primitives.css に存在する', () => {
    const css = readFileSync(join(cwd, PRIMITIVES), 'utf8')
    for (const selector of [
      '.btn',
      '.btn--outline',
      '.btn--primary',
      '.btn--danger',
      '.field',
      '.field-label',
      '.surface--floating',
      '.surface--raised',
      '.segmented',
      '.segmented-item',
    ]) {
      expect(css).toContain(`${selector} {`)
    }
  })

  it('基本形はすべてトークン経由で色・寸法を参照する(ハードコードした色を持たない)', () => {
    const css = readFileSync(join(cwd, PRIMITIVES), 'utf8')
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
    // 16進カラーと rgb()/hsl() の直書きを禁止する(color-mix の中のトークン参照は許す)
    expect(withoutComments).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(withoutComments).not.toMatch(/\b(?:rgb|rgba|hsl|hsla)\(/)
  })

  it('除外リストの各項目に理由が書かれている', () => {
    for (const exception of EXCEPTIONS) {
      expect(exception.reason.length).toBeGreaterThan(10)
    }
  })
})

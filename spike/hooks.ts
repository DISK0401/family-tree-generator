// family-chart の未使用フックの評価スパイク(選択肢A)
//
// Q1: setDuplicateBranchToggle(true) は、婿養子(同じ家族の子どうしが夫婦)の
//     重複描画を、我々が手作りした間引き(spouseSiblingsToSkip)なしで解消できるか
// Q2: setModifyTreeHierarchy で、婚姻でしかつながらない2つの血族を
//     1枚の木としてレイアウトできるか(全体表示のブロック分割の解消)
//
// 実データは個人情報のためリポジトリに置かず、検証したい構造だけを合成データで再現する。
import f3 from 'family-chart'
import 'family-chart/styles/family-chart.css'
import * as d3 from 'd3'

type Datum = {
  id: string
  data: { gender: 'M' | 'F'; label: string }
  rels: { parents?: string[]; spouses?: string[]; children?: string[] }
}

/** 婿養子: 徳雄・ぎんの子に実子 榮 と養子 兎一 が並び、その2人が夫婦 */
const mukoyoshi: Datum[] = [
  {
    id: 'tokuo',
    data: { gender: 'M', label: '徳雄' },
    rels: { parents: [], spouses: ['gin'], children: ['sakae', 'taichi'] },
  },
  {
    id: 'gin',
    data: { gender: 'F', label: 'ぎん' },
    rels: { parents: [], spouses: ['tokuo'], children: ['sakae', 'taichi'] },
  },
  {
    id: 'sakae',
    data: { gender: 'F', label: '榮' },
    rels: {
      parents: ['tokuo', 'gin'],
      spouses: ['taichi'],
      children: ['noriyoshi'],
    },
  },
  {
    id: 'taichi',
    data: { gender: 'M', label: '兎一' },
    rels: {
      parents: ['tokuo', 'gin'],
      spouses: ['sakae'],
      children: ['noriyoshi'],
    },
  },
  {
    id: 'noriyoshi',
    data: { gender: 'M', label: '紀佳' },
    rels: { parents: ['taichi', 'sakae'], spouses: [], children: [] },
  },
]

/**
 * 婚姻でしかつながらない2つの血族: 夫Aの実家(祖父GA)と妻Bの実家(祖父GB)。
 * `modifyTreeHierarchy` から参照する都合上、rels の3配列をすべて明示する
 * (family-chart の `formatData` は createChart へ渡した配列しか正規化しないため)
 */
const twoFamilies: Datum[] = [
  {
    id: 'ga',
    data: { gender: 'M', label: 'A祖父' },
    rels: { parents: [], spouses: ['gaw'], children: ['fa'] },
  },
  {
    id: 'gaw',
    data: { gender: 'F', label: 'A祖母' },
    rels: { parents: [], spouses: ['ga'], children: ['fa'] },
  },
  {
    id: 'fa',
    data: { gender: 'M', label: 'A父' },
    rels: { parents: ['ga', 'gaw'], spouses: ['ma'], children: ['a'] },
  },
  {
    id: 'ma',
    data: { gender: 'F', label: 'A母' },
    rels: { parents: [], spouses: ['fa'], children: ['a'] },
  },
  {
    id: 'a',
    data: { gender: 'M', label: '夫A' },
    rels: { parents: ['fa', 'ma'], spouses: ['b'], children: ['kid'] },
  },

  {
    id: 'gb',
    data: { gender: 'M', label: 'B祖父' },
    rels: { parents: [], spouses: ['gbw'], children: ['fb'] },
  },
  {
    id: 'gbw',
    data: { gender: 'F', label: 'B祖母' },
    rels: { parents: [], spouses: ['gb'], children: ['fb'] },
  },
  {
    id: 'fb',
    data: { gender: 'M', label: 'B父' },
    rels: { parents: ['gb', 'gbw'], spouses: ['mb'], children: ['b'] },
  },
  {
    id: 'mb',
    data: { gender: 'F', label: 'B母' },
    rels: { parents: [], spouses: ['fb'], children: ['b'] },
  },
  {
    id: 'b',
    data: { gender: 'F', label: '妻B' },
    rels: { parents: ['fb', 'mb'], spouses: ['a'], children: ['kid'] },
  },

  {
    id: 'kid',
    data: { gender: 'M', label: '子' },
    rels: { parents: ['a', 'b'], spouses: [], children: [] },
  },
]

type ChartOptions = {
  mainId?: string
  duplicateBranchToggle?: boolean
  modifyTreeHierarchy?: (root: unknown, isAncestry: boolean) => void
}

function render(sel: string, data: Datum[], options: ChartOptions = {}) {
  // main_id は data の先頭要素で決まる(calculateTree: `main_id = data_stash[0].id`)。
  // updateMainId を初回 updateTree より前に呼ぶと内部で落ちるため、並べ替えで指定する
  const ordered = options.mainId
    ? [...data].sort((a, b) =>
        a.id === options.mainId ? -1 : b.id === options.mainId ? 1 : 0,
      )
    : data
  const chart = f3
    .createChart(sel, structuredClone(ordered) as never)
    .setTransitionTime(0)
    .setCardXSpacing(130)
    .setCardYSpacing(110)
    .setSingleParentEmptyCard(false)

  if (options.duplicateBranchToggle) chart.setDuplicateBranchToggle(true)
  if (options.modifyTreeHierarchy) {
    chart.setModifyTreeHierarchy(options.modifyTreeHierarchy as never)
  }

  const card = chart.setCardHtml()
  card.setStyle('rect')
  card.setCardDim({ w: 90, h: 60, img: false })
  card.setCardInnerHtmlCreator((d: { data: unknown }) => {
    const p = d.data as Datum
    // duplicate_branch_toggle は `.card > .card-inner` の存在を前提に
    // トグルボタンを差し込む(handleCardDuplicateToggle)。
    // 完全なカスタムカードだと card_inner が null になって落ちるため、
    // 期待される入れ子を残したまま中身だけ差し替えられるかを確認する
    return `<div class="card-inner"><div class="spike-card">${p.data.label}</div></div>`
  })

  chart.updateTree({ initial: true, tree_position: 'fit' })
  return chart
}

/** 1つのパネルの失敗が他を巻き込まないように隔離し、失敗は画面とログに残す */
function safeRender(sel: string, data: Datum[], options: ChartOptions = {}) {
  try {
    render(sel, data, options)
  } catch (e) {
    const el = document.querySelector(sel)
    const message = e instanceof Error ? e.message : String(e)
    if (el)
      el.innerHTML = `<p style="padding:12px;color:#c73e3a">失敗: ${message}</p>`
    console.error(sel, e)
  }
}

// --- 1. 婿養子 / 素のデータ ---
safeRender('#c1', mukoyoshi)

// --- 2. 婿養子 / duplicate_branch_toggle ---
safeRender('#c2', mukoyoshi, { duplicateBranchToggle: true })

// --- 3. 2つの血族 / 素のデータ(main = 夫A) ---
safeRender('#c3', twoFamilies, { mainId: 'a' })

// --- 4. 2つの血族 / modifyTreeHierarchy で妻の実家の接ぎ木を試みる ---
// 祖先方向の hierarchy(root = 夫A)へ、妻Bの親をもう1組の「親」として足せるかを試す。
// family-chart は祖先方向も子孫方向も d3.hierarchy(=厳密な木)であり、
// 配偶者は木の外側に後から座標を付けて添えられるだけなので、
// 「妻の親」を置ける場所は構造上「夫の親の位置」しかない
safeRender('#c4', twoFamilies, {
  mainId: 'a',
  modifyTreeHierarchy: (rootUnknown, isAncestry) => {
    if (!isAncestry) return
    const root = rootUnknown as d3.HierarchyNode<Datum> & {
      children?: unknown[]
    }
    const byId = new Map(twoFamilies.map((d) => [d.id, d]))
    const wife = byId.get('b')
    if (!wife) return
    // 妻の親から祖先方向の部分木を作り、夫の祖先ツリーの子(=親の位置)として接ぎ木する
    const grafted = (wife.rels.parents ?? [])
      .map((id) => byId.get(id))
      .filter((d): d is Datum => d !== undefined)
      .map((parent) =>
        d3.hierarchy(parent, (d) =>
          (d.rels.parents ?? [])
            .map((id) => byId.get(id))
            .filter((x): x is Datum => x !== undefined),
        ),
      )
    for (const g of grafted) {
      const node = g as unknown as {
        parent: unknown
        depth: number
        each: (fn: (n: { depth: number }) => void) => void
      }
      node.parent = root
      // 接ぎ木した部分木の depth を、接続先に合わせてずらす
      const shift = root.depth + 1
      g.each((n) => {
        ;(n as { depth: number }).depth += shift
      })
      void node
    }
    root.children = [...(root.children ?? []), ...(grafted as unknown[])]
  },
})

// 検証結果をテストから読めるように、描かれたカード枚数を書き出す
setTimeout(() => {
  const counts = ['c1', 'c2', 'c3', 'c4'].map((id) => {
    const el = document.getElementById(id)
    return `${id}=${el ? el.querySelectorAll('.spike-card').length : 0}`
  })
  document.body.dataset.cardCounts = counts.join(',')
}, 1000)

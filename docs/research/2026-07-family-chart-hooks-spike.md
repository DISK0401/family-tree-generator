# family-chart 既存フックの評価スパイク(2026-07)

> **その後の経緯(2026-07-28 追記)**: 末尾「次にやること」の自前レイアウタは
> `add-connected-full-view` change として実装済み(`src/layout/` +
> `openspec/specs/pedigree-layout/spec.md`)。本文は調査時点の記録として書き換えない。

全体表示が「家ごとのブロック」に分かれる制約と、婿養子の重複描画に対して、**fork せずに
family-chart の未使用フックでどこまで到達できるか**を実測した記録。

- 対象バージョン: `family-chart@0.9.0`(MIT / 依存は d3 のみ)
- 検証コード: `spike/hooks.html` + `spike/hooks.ts`(`npm run dev` → `/spike/hooks.html`)
- 検証データ: 実データは個人情報のため使わず、問題の構造だけを再現した合成データ

## 背景: 制約の正体

`calculateTree`(dist 581〜872行)の構造がすべてを決めている。

```js
const tree_children = calculateTreePositions(main, 'children', false)  // 子孫方向の d3.hierarchy
const tree_parents  = calculateTreePositions(main, 'parents',  true)   // 祖先方向の d3.hierarchy
mergeSides(tree_parents, tree_children)   // main で2本を接合
setupSpouses(tree, node_separation)       // 配偶者は後から手で座標を付けて足すだけ
```

`setupSpouses` が作る配偶者ノードは `{ added: true, spouse: d, x: d.x - ..., y: d.y }` で、
**d3.hierarchy の一部ではない**。したがって配偶者の祖先・傍系は原理的にレイアウトされず、
「婚姻でしかつながらない2つの血族」を1枚の木として描けない。これが全体表示の分割の原因。

## Q1: `setDuplicateBranchToggle(true)` は婿養子の重複描画を解消するか

**答え: しない。** 我々の間引き(`spouseSiblingsToSkip`)を置き換えられない。

同じ家族の子である「実子 榮」と「養子 兎一」が夫婦であるデータで比較した。

| | 描画されたカード |
|---|---|
| 素のデータ | 徳雄・ぎん・**榮×2**・**兎一×2**・**紀佳×2**(8枚 / 実人数5) |
| `duplicate_branch_toggle: true` | 徳雄・ぎん・**榮×2**・**兎一×2**・紀佳×1(7枚) |

このオプションが畳むのは**子孫側だけ**で、夫婦のカードそのものは2組描かれ続ける。
畳まれた側には「C1」トグルが付き、利用者がどちらを展開するか切り替えられる。

つまり「同じ夫婦が2度出る」という見た目の問題は残る。現在の間引き(片方を子の辺から外し、
もう片方の配偶者として描く)のほうが結果は明らかにきれいなので、**採用しない**。

### 副次的な発見: カスタムカードとの非互換

`handleCardDuplicateToggle` はカードDOMに `.card > .card-inner` があることを前提に
トグルを差し込む(`card_inner.style.zIndex = 1`)。`setCardInnerHtmlCreator` で
完全に独自のカードを返している我々の実装では `card_inner` が `null` になり、
`Cannot read properties of null (reading 'style')` で描画が止まる。

回避するには、カードの中身を `<div class="card-inner">…</div>` で包む必要がある。
将来このオプションを使う場合の前提条件として記録しておく。

## Q2: `setModifyTreeHierarchy` で2つの血族を1枚につなげられるか

**答え: 位置は作れるが、系線は作れない。** 「完全に不可能」ではないが、実用には遠い。

夫Aの実家(A祖父母→A父母)と妻Bの実家(B祖父母→B父母)が、A・Bの婚姻でしか
つながらないデータで検証した。

| | 描画された人物 |
|---|---|
| 素のデータ(main=夫A) | 夫A・子・A父・A母・A祖父・A祖母・**妻B のみ**(7人) |
| `modifyTreeHierarchy` で妻の実家を接ぎ木 | 上記 + **B父・B母・B祖父・B祖母**(11人 = 全員) |

`modifyTreeHierarchy(root, is_ancestry)` は `d3.hierarchy` 構築後・レイアウト前に呼ばれるため、
妻の親から作った部分木を祖先ツリーへ接ぎ木すると、**世代の高さも含めて正しい位置に並ぶ**。

```
   A祖父─A祖母      B祖父─B祖母        ← 両家の祖父母が同じ世代に並ぶ
        │                │
      A父  A母        B父   B母
        │                                ← B父から妻Bへの系線が引かれない
      夫A ── 妻B
        │
        子
```

ただし残る問題が大きい。

1. **妻Bと B父・B母 を結ぶ系線が引かれない**。妻Bは `setupSpouses` が作る配偶者ノードで、
   接ぎ木した B父 の子ポインタは(接ぎ木先である)夫Aを向いているため
2. **B父・B母 の婚姻線も引かれない**。夫婦線は「あるノードの `parents` が2件のとき」に
   引かれる処理で、接ぎ木した組は対象外
3. 系線は `createLinks` が木の構造から導出するため、上記2つを直すには
   系線生成そのものへ手を入れる必要がある

つまり **`modifyTreeHierarchy` は座標だけを貸してくれるフック**であり、
関係の意味づけ(系線)は付いてこない。これを実用品質にするには系線の後処理を自作することになり、
それは「自前レイアウトを書く」のとコストが変わらなくなる。

### 副次的な発見: 接ぎ木するデータの正規化

`formatData` は `createChart` へ渡した配列しか正規化しない(`rels.parents` 等の欠損を `[]` で埋める)。
フックから元データを参照して接ぎ木すると未正規化のオブジェクトが混入し、
`isAllRelativeDisplayed` が `r.parents is not iterable` で落ちる。

また `main_id` は `data_stash[0].id` で決まる。初回 `updateTree` の前に `updateMainId` を
呼ぶと内部で落ちるため、スパイクでは配列の並べ替えで main を指定した。

## 結論

- **Q1 は不採用。** 現在の間引きのほうが結果が良い
- **Q2 は「フックでは届かない」ことが確認できた。** 位置は作れるが系線が付かず、
  埋めるコストは自前レイアウトと変わらない
- したがって、**1枚につながった全体表示は自前レイアウト(選択肢C)で進める**のが妥当
- **fork(選択肢B)は現時点では不要**。上流のフックは今回の目的には足りず、
  かといって fork してレイアウトを書き換えるなら、family-chart の外で書くのと手間が変わらない。
  折りたたみ表示は family-chart のままでよく動いているため、そこは据え置く

## 次にやること

自前レイアウト(選択肢C)を新しい OpenSpec change として起こす。全体表示のみを対象とし、
折りたたみ表示(対話的な編集面)は family-chart のまま据え置く。将来の PDF/巻物出力も
同じレイアウタの上に載せられる形にする。

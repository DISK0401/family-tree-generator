## Context

`FamilyTreeCanvas.tsx`(折りたたみ表示・全体表示(家系ごと)の描画)は、family-chart(D3.js)の `setCardYSpacing` / `setCardXSpacing` にそれぞれ `170` / `180` を渡している。family-chart 内部ではこれらが `d3.tree().nodeSize([node_separation, level_separation])` の `level_separation`(世代=depthごとの間隔)・`node_separation`(同一世代内の隣接ノード間隔)として使われ、カードは自身の中心点(`translate(-w/2, -h/2)`)を基準に描画される。したがって、ある世代の人物カードの下端が次の世代のカードの上端へ食い込まないためには、`level_separation`(setCardYSpacing) が常に `CARD_SIZE.height` を上回っている必要がある。

この2つの数値は2026-07-16(`src/rendering/FamilyTreeCanvas.tsx` 作成時、当時 `CARD_WIDTH=96` / `CARD_HEIGHT=108`)に一度設定されて以降、一度も変更されていない。一方で `CARD_SIZE`(現 `src/layout/coordinates.ts`)はその後 `96×108 → 120×160 → 104×116 → 128×148 → 136×180` と複数回変更されてきた。直近の `fix-tree-card-overlap-and-density` で高さが `148→180` へ拡大された結果、`level_separation(170) < CARD_SIZE.height(180)` となり、隣接世代のカードが縦に約10px重なるようになった(proposal.md参照)。

`つながった全体表示`(`src/layout/coordinates.ts` の `assignCoordinates`)は世代の行位置を `rowTop(generation) = generation * (CARD_SIZE.height + VERTICAL_GAP)` として都度算出しており、`CARD_SIZE` の変更に自動追従するため、この不具合の対象外である。

## Goals / Non-Goals

**Goals:**
- `setCardYSpacing` / `setCardXSpacing` を `CARD_SIZE` から算出する形にし、`level_separation` が常に `CARD_SIZE.height` を、`node_separation` が常に `CARD_SIZE.width` を上回ることを構造的に保証する
- 今後 `CARD_SIZE` が変更されても、この2つの設定値だけが取り残されて再びカードが重なる、という同種の回帰が起きない設計にする

**Non-Goals:**
- 折りたたみ表示・全体表示(家系ごと)の間隔デザイン(余白の広さ)を新たに検討・変更すること。今回は「本来あるべきだった間隔まで戻す」後追いの修正にとどめる
- `つながった全体表示`(`pedigree-layout`)側の `HORIZONTAL_GAP` / `VERTICAL_GAP` の値を変更すること
- family-chart の間隔計算モデル(`node_separation`/`level_separation` の意味そのもの)を変更・拡張すること

## Decisions

### D1: 間隔をカード寸法 + マージン定数として算出し、マージン値は「壊れる直前(直近の `CARD_SIZE` 拡大前)に実際に効いていた余白」を復元する値にする

`FamilyTreeCanvas.tsx` に以下のマージン定数を追加し、`setCardYSpacing`/`setCardXSpacing` の引数を `CARD_SIZE` から算出する。

```ts
// family-chartの世代間隔(setCardYSpacing)・同世代内間隔(setCardXSpacing)は
// CARD_SIZEを上回っている必要がある(カードは中心基準で描画されるため)。
// マージンはCARD_SIZE拡大前の最後に破綻していなかった実効値を復元したもの
const FAMILY_CHART_ROW_MARGIN = 22 // 170(旧CardYSpacing) - 148(旧CARD_SIZE.height)
const FAMILY_CHART_COLUMN_MARGIN = 44 // 180(旧CardXSpacing) - 136(現CARD_SIZE.width)
...
.setCardYSpacing(CARD_HEIGHT + FAMILY_CHART_ROW_MARGIN) // = 202
.setCardXSpacing(CARD_WIDTH + FAMILY_CHART_COLUMN_MARGIN) // = 180(数値は現状維持)
```

X方向は現在重なりが起きていない(`180 - 136 = 44px` の余白が既にある)ため、マージンを既存の実効値(44)に合わせることで数値上の変更なし(`180`のまま)にする。Y方向は直近の `CARD_SIZE.height` 拡大(`148→180`)で余白が失われた(`170-148=22` → `170-180=-10`)ため、拡大前に効いていた余白(22px)をマージンとして復元する。これにより `CARD_YSpacing` は `170→202` に増える(重なり解消に必要な最小限の増加)。

*代替案1*: `src/layout/coordinates.ts` の `HORIZONTAL_GAP`(24)/`VERTICAL_GAP`(96)をそのまま流用する → これらは `つながった全体表示` 専用に、系線のレーン(複数の親子線が重ならないよう帯を割り当てる仕組み)を挟むために設計された値であり、家系図全体のレイアウトアルゴリズムが違う(family-chartはd3.hierarchyベースの木構造、`pedigree-layout`は結合点・レーンを持つ独自グラフ)。特に `VERTICAL_GAP=96` を採用すると `setCardYSpacing` が `180+96=276` となり、現状(170)から60%以上も間隔が広がり、Non-Goal「間隔デザインの変更はしない」に反する。数値的な意味も異なる(`level_separation`は世代間の中心距離、`VERTICAL_GAP`は「カード下端から次のカード上端まで」の意図の値)ため、値の使い回しは適切でない
- *代替案2*: 固定のせ余白(例: 一律20px)を新たに決め直す → 「壊れる前の実効値を復元する」という機械的な基準の方が、今回のスコープ(バグ修正)にふさわしい主観的判断を避けられる。デザイン上の間隔を積極的に見直したい場合は別changeで扱う

### D2: マージン定数は `FamilyTreeCanvas.tsx` に置く(`CARD_SIZE` 自体には持たせない)

`CARD_SIZE`(`src/layout/coordinates.ts`)は `src/layout` 配下にあり、`src/layout` は `src/rendering`/family-chart 固有の概念に依存できない(`src/layout/types.test.ts` が機械的に検査する)。family-chart 特有の間隔モデル(`node_separation`/`level_separation`)の都合によるマージンは、family-chartを直接使う `FamilyTreeCanvas.tsx` 側に閉じて持たせ、`CARD_SIZE` を読むだけの一方向の依存を保つ。

## Risks / Trade-offs

- [`setCardYSpacing` が `170→202` に増えることで、折りたたみ表示・全体表示(家系ごと)の縦方向の縮尺がわずかに疎になる(1画面に収まる世代数がわずかに減る)] → 重なりというバグを解消するための必要最小限の増加(32px)であり、他に選択肢がない。実装時にPlaywrightスクリーンショットで許容範囲か確認する
- [今回の算出方法にしても、`CARD_SIZE` の将来の拡大幅次第ではマージンが小さく感じられる可能性は残る(マージン自体は固定値のため)] → 完全な自動追従(比率ベース等)は今回のスコープ外。マージンが `CARD_SIZE` と共に定義され、`CARD_SIZE`変更時に「カードが重ならないか」を意識せざるを得ない位置(同じファイル・隣接する定数)に置くことで、今回のような見落としの再発を減らす

## Migration Plan

見た目のみの修正(family-chart設定値の算出方法の変更)で、データモデル・保存形式の変更を伴わないため、特別な移行手順は不要。通常のコミット単位でのデプロイ・ロールバック(revert)で対応する。

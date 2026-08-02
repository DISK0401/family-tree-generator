## Context

現状、カード間隔を決める定数は2箇所に分かれている。

- `src/organisms/tree-canvas/FamilyTreeCanvas.tsx`(折りたたみ表示・全体表示(家系ごと)、family-chartベース): `FAMILY_CHART_ROW_MARGIN`(22px)/`FAMILY_CHART_COLUMN_MARGIN`(44px)。`setCardYSpacing`/`setCardXSpacing`へ`CARD_SIZE + マージン`を渡している
- `src/layout/coordinates.ts`(つながった全体表示、pedigree-layoutベース): `VERTICAL_GAP`(96px)/`HORIZONTAL_GAP`(24px)。`VERTICAL_GAP`は見た目の余白だけでなく、`assignLinkLanes`/`laneYOf`で複数の系線が交差しないようレーンを割り付けるための実領域としても使われている

婚姻日ラベルは family-chart の `setLinkSpouseText` API 経由で表示している(`FamilyTreeCanvas.tsx`)。このAPIはラベルの文字列(テキスト内容)のみを制御でき、表示位置・重なり順はライブラリ内部の `linkSpouseText`(`node_modules/family-chart/dist/family-chart.esm.js`)が決める。人物カードは `div.cards_view`(HTML)、ラベルを含む系線は `svg.main_svg .links_view`(SVG)という別レイヤーで、両者は兄弟要素としてDOMに存在し、通常のDOM順(cards_viewが後、かつ上に重なる)でカードがラベルより前面に描かれている。ラベルは配偶者カード間の隙間の中心に `text-anchor: middle` で配置されるため、隙間幅がラベルの描画幅より狭いと、ラベルの大部分がカードの背後に隠れる。

`.tree-card.selected`(`src/organisms/tree-canvas/person-card.css`)は、選択時に`border-width`を1px→2pxへ増やす代わりにpaddingを縮める実装になっているが、その縮小幅は`.tree-card`本体の旧いpadding-top(`var(--space-2)`)を基準にしたままで、性別インジケーター・故人マーカーの行を確保するために後から追加された`var(--space-5)`基準のpadding-topに追従していない。

本changeはクライアント側の描画・スタイル(CSS・定数・ライブラリ設定値)のみの変更であり、データの保存・送信経路(IndexedDB、GEDCOM/JSON入出力、有償版のSupabase・Gemini API連携)への変更はない。

## Goals / Non-Goals

**Goals:**
- 婚姻日ラベル(和暦フル精度を含む)が人物カードに隠れず常に判読できるようにする
- 折りたたみ表示・全体表示(家系ごと)とつながった全体表示のカード間隔(縦・横)を単一の定数へ一元化し、表示モード間で見た目の余白を揃える
- カード選択時の強調表現を、カード本体のpaddingが将来変わっても自動的に追従する構造にする

**Non-Goals:**
- つながった全体表示(pedigree-layout)に婚姻日ラベル表示機能そのものを新規追加すること(現状family-chartベースの2表示のみが対象で、その範囲は変えない)
- カードデザイン全体の再設計(色・書体・寸法等)
- pedigree-layoutのレーン割り当てアルゴリズム自体の変更

## Decisions

### D1: 間隔定数を `coordinates.ts` の `VERTICAL_GAP`/`HORIZONTAL_GAP` に一本化する

`FamilyTreeCanvas.tsx` の独自定数(`FAMILY_CHART_ROW_MARGIN`/`FAMILY_CHART_COLUMN_MARGIN`)を削除し、`src/layout/coordinates.ts` からエクスポートされる `VERTICAL_GAP`/`HORIZONTAL_GAP` を直接importして `setCardYSpacing`/`setCardXSpacing` を算出する。

- **縦方向**: `VERTICAL_GAP`(96px)を採用する。`pedigree-layout`側の値を縮める選択肢はない(レーン割り当てに必要な実領域のため)。`setCardYSpacing = CARD_HEIGHT + VERTICAL_GAP`(180+96=276)
- **横方向**: 婚姻日ラベル(和暦フル精度)が確実に収まる幅を実装時にPlaywrightで実測し、その値と現行の`HORIZONTAL_GAP`(24px)の大きい方を新しい`HORIZONTAL_GAP`として採用する。両エンジンがこの1つの値を共有する

*代替案1*: 横方向は一元化せず、family-chart側だけラベル用に広い値を個別に持つ → ユーザーが明確に「広い方に統一でよい」と決めているため却下。定数が2箇所に残ると今回と同種の乖離が将来また起きる
*代替案2*: ラベル文字列を短縮表記にして現行の間隔(24〜44px)に収める → 既存の`display-settings`要件(D9)で「常にフル精度で表示する」と決めた表示仕様を覆すことになりスコープ外。ユーザーは「余白をもっととっていい」と明言しており、間隔拡大が意図に合う

### D2: ラベルの重なり対策は間隔拡大のみで行い、SVG/HTMLレイヤーの重なり順変更は採用しない

婚姻日ラベルがカードに隠れる問題は、D1の横方向の間隔拡大だけで解消する方針とする。ラベルを含むSVGレイヤー(`svg.main_svg`)をカードのHTMLレイヤー(`div.cards_view`)より前面に出すCSSの重なり順変更は、この change では行わない。

- **理由**: 前面化はfamily-chartライブラリの内部DOM構造(`cards_view`と`main_svg`が兄弟要素)に依存する実装になり、ライブラリのマイナーバージョン更新で構造が変わった場合に静かに壊れるリスクがある。加えて親子の系線本体も一緒に前面へ出てしまい、系線がカードの角に重なって見える新たな見た目の問題を生みかねない。間隔拡大だけで判読性の問題が解決できる見込みが立ったため、よりリスクの低い方法を採る

### D3: `.tree-card.selected` を `outline` ベースの表現に変更する

現行の「`border-width`を1px→2pxに増やし、その分paddingを縮める」実装をやめ、`outline`(+`outline-offset`)で選択強調を表現する。

```css
.tree-card.selected {
  outline: 2px solid var(--shu);
  outline-offset: 1px;
  box-shadow: ...(既存の朱のハローは維持);
}
```

- `outline`はボックスモデル(width/height/padding)に影響しないCSSプロパティのため、`.tree-card`本体のpaddingが将来変わっても`.selected`側が追従を忘れて崩れる、という今回と同種の不具合が構造的に発生しなくなる
- `border-width`・`padding`は`.tree-card`本体の値のまま変更しない

*代替案*: `.tree-card.selected`のpadding値を`var(--space-5)`基準の正しい値へ単純に直す → 今回の不具合は直るが、「カード本体のpaddingが変わったときにまた追従し忘れる」という再発条件そのものは残る。ユーザーが「今後カードdesignを変更したときに追従漏れがないように」と明示的に求めているため、構造的に再発し得ない方式を採る

## Risks / Trade-offs

- [縦間隔が202px→276pxへ拡大し、折りたたみ表示・全体表示(家系ごと)で1画面に収まる世代数が減る] → ユーザー了承済み。実装時にPlaywrightスクリーンショットで許容範囲か確認する
- [横間隔がラベル実測値まで拡大されると、つながった全体表示の同一世代内の余白も連動して広がり、家族数の多い家系図で横方向に間延びする可能性がある] → 実装時にPlaywrightスクリーンショットで確認する。許容できない見た目になった場合はユーザーに再確認する
- [`outline`による選択強調は、ブラウザ・OSのキーボードフォーカスリングと視覚的に紛らわしくなる可能性がある] → 朱色(`var(--shu)`)と既存の半透明box-shadowハローを維持し、視覚的な差別化を保つ。実装後にライト/ダーク両テーマでスクリーンショット確認する
- [間隔定数の変更により、`coordinates.test.ts`等の既存テストが変更後の値を前提にしていない場合に失敗する] → 実装時に該当テストを確認し、新しい定数値に合わせて更新する

## Migration Plan

見た目のみの修正(CSS・定数・ライブラリ設定値の変更)で、データモデル・保存形式の変更を伴わないため、特別な移行手順は不要。通常のコミット単位でのデプロイ・ロールバック(revert)で対応する。

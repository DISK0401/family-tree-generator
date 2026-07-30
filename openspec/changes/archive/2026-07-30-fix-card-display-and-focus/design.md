## Context

人物カードの氏名は `src/rendering/person-card.ts` の `personCardInnerHtml` が組み立て、`src/rendering/FamilyTreeCanvas.css` が見た目を定義する。このHTML/CSSは折りたたみ表示・全体表示(family-chart, `FamilyTreeCanvas.tsx`)とつながった全体表示(`PedigreeCanvas.tsx`)の両方から共有されている(`PedigreeCanvas.css` はカードの見た目を再定義していない)。

現状の `.tree-card-surname` / `.tree-card-given`(`FamilyTreeCanvas.css:134-142`)は `writing-mode: vertical-rl` のみを指定し、`white-space` を指定していない(既定値 `normal`)。親の `.tree-card-name-row`(同 124-132)は `flex-direction: row-reverse` かつ `min-height: 0` で、カード自体(`.tree-card`, 同 35-57)は `CARD_SIZE`(`src/layout/coordinates.ts`)由来の固定 `width`/`height` を持つ。

氏名の文字数に対して名前列の高さが不足すると、`white-space: normal` により縦書きテキストが行送り方向(右→左)へ折り返され、追加の列として挿入される。折り返された列は元の列の左側に生成されるため、見た目上は文字の並びが反転・分断されたように見える(「富岡大裕」→「裕大岡富」)。列数が増えることでカードの固定幅を超え、枠からのはみ出し(「富岡愛梨奈」)も同時に起きる。カード寸法はレイアウト計算(`PedigreeCanvas`のノード間隔等)の前提として全カード共通の固定値であるため、名前が長いからといって個々のカードだけを大きくする対応は取れない。

「配偶者を追加」「子を追加」「親を追加」(`PersonPanel.tsx` の `handleSubmit`, 146-162行)は `addSpouse`/`addChild`/`addParent`(`src/domain/commands.ts`)が返す `{ doc, spouseId/childId/parentId, familyId }` のうち `doc` しか使っておらず、新規作成した人物のIDを呼び出し元へ伝える手段がない。選択状態(`selectedPersonId`)は `App.tsx` が保持し、`requestSelectionChange`(未確定の変更がある場合は確認ダイアログを挟む)経由でのみ変更される。同様のパターンは `FamilyTreeCanvas.tsx:445` の `AddPersonControl` の `onAdded` コールバックに既に存在する。

## Goals / Non-Goals

**Goals:**
- 縦書き氏名が、文字数によらず列の並び順が崩れずに表示されること(折りたたみ表示・全体表示・つながった全体表示のすべてで)
- カード枠から氏名がはみ出さないこと
- 「配偶者を追加」「子を追加」「親を追加」で新規作成した人物へ、作成直後にキャンバス上の選択状態と編集パネルが自動的に切り替わること

**Non-Goals:**
- カード自体の寸法(`CARD_SIZE`)やレイアウトアルゴリズムの変更
- 氏名の表示を横書きへ変更するなど、縦書きという既存のデザイン言語(design.md D6)自体の見直し
- 既存人物を関係先として選ぶ(`handleSelectExisting`)場合の遷移仕様の変更(対象人物は新規作成されないため、現状の据え置きのままとする)

## Decisions

**D1: 縦書き名前列は折り返し禁止(`white-space: nowrap`)にする**

`.tree-card-surname`/`.tree-card-given` に `white-space: nowrap` を指定し、縦書きテキストが追加の列へ折り返されることを禁止する。これにより文字の並び順崩れ(bug 1)を構造的に防ぐ。折りたたみ表示・全体表示は同一CSSクラスを共有するため、bug 2(折りたたみ表示での改行崩れ)も同時に直る。

*代替案*: `overflow-wrap`等での折り返し制御 → 縦書きでの折り返し単位は「列」でしかなく、氏名を列内で折り返して読ませることは日本語の名前表示として不自然(表札・位牌と同様、氏名は1列で読めることが前提)。`nowrap`一択とする。

**D2: 文字数に応じて氏名のフォントサイズを縮小する**

`nowrap`だけでは、名前列の高さがカードの固定高さを超える場合に依然としてはみ出しが起こる(bug 1の「富岡愛梨奈」)。カード寸法(`CARD_SIZE`)は全カード共通の固定値でレイアウト計算の前提のため、個々のカードを名前の長さに応じて拡大することはできない。そこで `derivePersonCardView`(`src/rendering/person-card.ts`)に、姓・名それぞれの文字数から縮小率を導出する処理を追加し、`personCardInnerHtml` が生成する各名前列の `<div>` へインラインスタイル(`font-size`のスケール)として適用する。姓・名は独立した列のため、縮小率も列ごとに(長い方に合わせてではなく)個別に決める。

スケールは「カードに収まる最大の文字数を基準に、それを超える文字数では文字数に反比例して縮小する」段階的な関数とし、下限(可読性を保てる最小フォントサイズ)を設ける。

*代替案*: JS側でDOM計測してオーバーフローを検知しフォントサイズを調整(いわゆるauto-fit) → family-chart側のDOM生成タイミングと二重に絡む実装になり複雑度が高く、再描画のたびに計測コストが発生する。文字数という決定的な入力からCSSスケールを算出する方が、`derivePersonCardView`が既に持つ「純粋関数でカードの見た目を決める」設計(design.md D3)とも整合する。

**D2.5: ふりがな行は「表示設定オン」だけで存在を決め、データの有無では消さない**

`personCardInnerHtml`(`person-card.ts`)はカードの各部を`.tree-card`のflex縦積みとして並べる。`.tree-card-kana`は氏名列(`.tree-card-name-row`)より前に置かれるため、この行が現れるかどうかで氏名列の開始位置(縦方向)が変わる。従来は`derivePersonCardView`が「表示設定オフ」と「表示設定オンだがこの人物にふりがなデータが無い」の両方を`kana: undefined`として返しており、後者でも行そのものが消えていた。ふりがな入力済みの人物と未入力の人物が同じ図に混在すると、未入力の人物だけ氏名列が上へ詰まって見える(実機で報告)。

`kana`を「表示設定オフ→`undefined`(行なし)」「表示設定オン・データ無し→`''`(空文字、行はあるが空)」に区別し、`personCardInnerHtml`は`view.kana !== undefined`で行の有無を判定する。空の`<div>`でも`line-height`由来の高さは残るため、`.tree-card-kana`に明示的な`min-height`を添えて高さをブラウザ実装差に依存させない。

*代替案*: 表示設定が有効な間は常にJSでプレースホルダー要素の高さを計測して他のカードへ揃える → 実装が重く、`derivePersonCardView`が持つ「純粋関数でカードの見た目を決める」設計(D3)から外れる。「行の存在は表示設定だけで決める」という単純な規則のほうが見通しがよい。

**D3: 新規作成した人物へ自動的にフォーカス・編集パネルを切り替える**

`PersonPanel` に `onPersonCreated?: (personId: PersonId) => void` を追加し、`handleSubmit` 内で `addSpouse`/`addChild`/`addParent` が返す新規人物IDを使って呼び出す。`App.tsx` はこれを既存の `requestSelectionChange` に接続する。`AddPersonControl` の `onAdded` と同じパターンを踏襲することで、「人物を新規作成したら選択が切り替わる」という挙動をアプリ全体で一貫させる。

未確定の変更(`isDirty`)が別途ある状態でも、`requestSelectionChange` の既存の確認ダイアログ経路にそのまま乗せる(仕様「未確定の変更がある状態で別人物を選択する」との整合を保つ)。

対象操作は「配偶者を追加」「子を追加」に加えて「親を追加」も含める。3操作は同一の `handleSubmit` を経由する同型の処理であり、親の追加だけ挙動が異なると一貫性を欠くため。

## Risks / Trade-offs

- [フォントを縮小しすぎると可読性が落ちる] → 縮小率に下限を設け、極端に長い氏名でも最小限読める大きさを保証する
- [D2のスケール関数がカードCSSの実測値(パディング・行間)と乖離すると、縮小してもなお微小なはみ出しが起こりうる] → 実装後に典型的な文字数(2〜6文字)の氏名で目視確認し、境界値をテストする(`card-consistency.test.tsx`に追加)
- [新規作成時の自動フォーカスが、既存の「未確定の変更」確認ダイアログと組み合わさると、意図せずダイアログが挟まり操作感を損なう可能性] → 既存の確認フローへそのまま委譲することで新規の分岐を増やさず、挙動の一貫性を優先する

## Migration Plan

データモデル・保存形式の変更を伴わないUI/CSS修正のため、特別な移行手順は不要。通常のコミット単位でのデプロイ・ロールバック(revert)で対応する。

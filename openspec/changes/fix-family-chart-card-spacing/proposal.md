## Why

「折りたたみ表示」「全体表示(家系ごと)」で、隣接する世代の人物カードが縦方向に重なって表示が崩れる不具合が報告された。原因は `FamilyTreeCanvas.tsx` の family-chart 設定(`setCardYSpacing(170)` / `setCardXSpacing(180)`)が `CARD_SIZE`(`src/layout/coordinates.ts`)と連動しない固定値のままになっていること。直近の `fix-tree-card-overlap-and-density` で `CARD_SIZE.height` が 148→180 へ拡大された結果、カード高さ(180)が世代間の行間隔として family-chart に渡している `level_separation`(170)を上回り、隣接世代のカードが縦に約10px重なるようになった。`つながった全体表示`(`src/layout/coordinates.ts` 経由)は行間隔を `CARD_SIZE.height + VERTICAL_GAP` から都度算出しているため影響を受けず、症状は前者2つの表示に限定されている。

## What Changes

- `FamilyTreeCanvas.tsx` の `setCardYSpacing` / `setCardXSpacing` に渡す値を、ハードコードされたマジックナンバー(170 / 180)から `CARD_SIZE`(`src/layout/coordinates.ts` の正本定数)を基準に算出する値へ変更する
  - Y方向(`level_separation`)は必ず `CARD_SIZE.height` を上回る値にする(カード自体が上下に重ならないことを保証する)
  - X方向(`node_separation`)も同様に `CARD_SIZE.width` を基準に算出し直す
- 今後 `CARD_SIZE` が変更された際に、family-chart 側の間隔設定だけが取り残されて再び同種の重なりが再発しないようにする(定数の一箇所化による回帰防止)
- 見た目の余白量(現状の実効マージン)は変更前後で概ね維持し、カード拡大に対する後追いの帳尻合わせにとどめる(意図的な間隔デザインの変更は今回のスコープ外)

**Non-Goals**:
- `CARD_SIZE` 自体の再拡大・縮小(直近の変更で確定した寸法は変えない)
- カード内部のレイアウト(氏名・ふりがな等の配置)への変更
- `つながった全体表示`(`pedigree-layout` capability)側のレイアウト計算ロジックの変更(元々このバグの影響を受けていない)

## Capabilities

### New Capabilities

(なし)

### Modified Capabilities

- `tree-rendering`: 「自動レイアウト」要件に、隣接する世代の人物カードが重ならないことを明示的な要件・シナリオとして追加する(現状は線の交差・重なり回避のみが明記されており、カード同士の重なり回避が要件として抜けていた)

## Impact

- **対象コード**: `src/organisms/tree-canvas/FamilyTreeCanvas.tsx`(`setCardYSpacing`/`setCardXSpacing` の算出方法)。`src/layout/coordinates.ts` の `CARD_SIZE` 自体は変更しない(参照するのみ)
- **影響範囲**: 折りたたみ表示・全体表示(家系ごと)の両方(同一の family-chart インスタンス・同一の間隔設定を共有しているため)。つながった全体表示は元々影響を受けていないため変更不要
- **無料版/有償版への影響**: フロントエンドの描画コンポーネントのみの変更で、無料版・有償版どちらも同じ家系図キャンバスUIを使うため両方に影響する。サーバ通信・データ保存形式・課金導線への変更はない
- **プライバシー・法務への影響**: なし。戸籍データの流れ(保存先・送信先・暗号化)に変更はなく、外部リソースの追加もない
- **既存レイアウトへの影響**: 折りたたみ表示・全体表示(家系ごと)のカード間隔(見た目の縮尺)がわずかに変わる可能性がある(重なり解消のための最小限の調整)。`TreeDocument` のデータ自体・GEDCOM/JSONのエクスポート内容には影響しない
- **ロールバック方針**: 見た目のみの修正(定数算出方法の変更)で、データモデル・保存形式の変更を伴わないため、通常のコミット単位でのrevertで対応可能

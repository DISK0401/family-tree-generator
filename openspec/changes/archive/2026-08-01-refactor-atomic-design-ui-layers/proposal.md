## Why

UI の見た目の「基本形」がコンポーネントごとの CSS に散っており、ボタンや入力欄の手触りを変えるだけで多数のファイルを触る必要がある。実測では **25 個の CSS のうち 22 個が `border-radius` を独自に定義**し、ボタン・入力のリセット宣言 `font: inherit` が **14 ファイル・29 箇所**、`border-radius: var(--radius)` が **43 箇所**に重複している。セグメント切替(`role="group"` + `aria-pressed`)は **6 箇所で独立実装**されている。デザイントークン(`src/styles/tokens.css`)は整備済みだが、トークンの「上」にある基本形の層が存在しないため、トークンだけでは一箇所修正が成立しない。

同時に `src/components/` が 19 コンポーネントのフラット構成で、粒度(汎用部品・ドメイン部品・機能画面)が混在しており、どこに何があるか・新しい部品をどこへ置くべきかが判断できない。さらに `src/features/person-table/` は純関数(`columns.ts` / `tsv.ts`)だけを持ち、対応する UI の `PersonTableView.tsx` は `src/components/` にあるため、**1 つの機能が 2 箇所に割れている**。

有償版(戸籍スキャン → OCR 校正 → クラウド保存)では UI 部品の再利用範囲が広がる。ドメインにも状態にも依存しない部品を層として切り出しておくことが、有償版開発時の資産になる。

## What Changes

- **UI 層を Atomic Design の 5 層として実フォルダ化する**: `src/atoms/` `src/molecules/` `src/organisms/` `src/templates/` `src/pages/`
  - 層の境界は主観ではなく **依存の向き**で定義し、機械判定可能にする(下記)
  - `src/organisms/` の内部は機能単位で切り、機能に属する純関数を UI と同居させる(`organisms/person-table/` に `PersonTableView.tsx` と `columns.ts` を同居)
- **見た目の基本形を `src/styles/primitives.css` に単一化する**: ボタン・入力・面(サーフェス)・セグメント切替の基本形を 1 箇所に置き、各コンポーネント CSS から重複宣言を削除する
- **`src/atoms/` に UI プリミティブを新設する**: `Button` / `Field` / `SegmentedControl` / `Surface` / `Dialog`。6 箇所のセグメント切替を `SegmentedControl` に統合する
- **`src/features/` を廃止し `src/organisms/<機能>/` へ統合する**: `person-table` / `import-export` の純関数が対応する UI と同居する
- **`src/rendering/` を `src/organisms/tree-canvas/` へ、`src/settings/` の UI を `src/organisms/settings/` へ移す**。`src/settings/` の状態(`display-settings-store.ts` / `display-settings.ts`)は `src/store/` へ集約する(Atomic Design の層は UI の分類軸であり、状態は層の外に置く)
- **`App.tsx` を骨組みと状態に分離する**: `templates/AppShell.tsx`(レイアウトのスロット・状態なし)と `pages/AppPage.tsx`(状態管理)
- **層の規律を機械検証で固定する**: ESLint の `no-restricted-imports` で層をまたぐ依存を禁止し、CSS 検証テストで基本形の再定義を禁止する
- 振る舞い・視覚表現は一切変更しない。**視覚回帰ゼロが完了条件**であり、UI 仕様(既存 spec)への変更は含まない

### 層の境界(機械判定)

| 層 | 判定基準 | 該当数(実測) |
| --- | --- | --- |
| `atoms/` | `domain/` を import しない。ドメイン語彙を持たない | 新設 5 部品 |
| `molecules/` | `domain/` の型は知ってよい。`store/` を import しない。**機能をまたいで 2 箇所以上**から使われる | 5(`ConfirmDialog` 7 箇所 / `PersonNameFields` 4 箇所 / `PersonPicker` 3 箇所 / `WarekiDateInput` 2 箇所 / `person-name.ts` 3 箇所) |
| `organisms/<機能>/` | `store/` を購読してよい。1 つの機能に属する | 14 コンポーネント + 機能固有の純関数 |
| `templates/` | レイアウトの骨組み。状態を持たない | 1(`AppShell`) |
| `pages/` | ルーティングと状態管理 | 2(`AppPage` / `LandingPage`) |

`ZoomControls` は 2 箇所から使われるが両方 `tree-canvas` 機能内のため `molecules/` へは上げず `organisms/tree-canvas/` に置く。`PersonEditForm` は `store` 非依存で `molecules/` の設計要件を満たすが現在の利用は 1 箇所のため `organisms/person-edit/` に置き、有償版の OCR 校正 UI で 2 箇所目が生まれた時点で昇格させる。

## Capabilities

### New Capabilities

- `ui-component-layers`: UI コンポーネントの層構造と層間の依存規則、見た目の基本形の単一情報源、およびそれらを機械検証で維持する仕組み

### Modified Capabilities

なし。本変更は構造の再編であり、ユーザーから観測できる振る舞い・視覚表現・アクセシビリティ名を変更しない。既存 spec(`tree-editor` / `tree-rendering` / `person-table-editor` / `display-settings` 等)の要件は変わらない。

## Impact

### 影響するコード

- 移動対象: `src/components/`(19 コンポーネント)、`src/rendering/`、`src/settings/`、`src/features/`、`src/pages/`、`src/App.tsx`
- 規模: 実装 **8,355 行**(テスト除く)、テスト **7,044 行**が影響圏
- 新規: `src/styles/primitives.css`、`src/atoms/`(5 部品)、ESLint 層間依存ルール、CSS 検証テスト
- 変更なし: `src/domain/` `src/store/`(追加のみ) `src/persistence/` `src/layout/` `src/lib/` `src/samples/` `worker/` `e2e/` `spike/`

### テストへの影響

テストは構造非依存に書かれているため移動に強い。実測: `getByRole` 361 箇所 / `ByLabelText` 79 箇所 / `ByText` 53 箇所に対し、**クラス名依存の `querySelector` は 19 箇所のみ**、`toHaveClass` は **0 箇所**。テストファイルは対応する実装と同じ層へ移動し、変更は import パスに限られる。

### 命名の衝突と対策

既存の `src/layout/`(つながった全体表示の座標計算エンジン・純関数)は、新設する `src/templates/` と役割が紛らわしい。本変更の scope を膨らませないため改名は行わず、`design.md` と README で「`layout/` = 座標計算、`templates/` = UI の骨組み」と役割を明記して区別する。

### UX への影響

なし。内部構造の再編であり、画面・操作・文言・アクセシビリティ名を変更しない。競合製品との UX 比較が論点になる変更ではない(現行 UX の維持そのものが完了条件)。視覚回帰は変更前後のスクリーンショット比較(ライト/ダーク両テーマ)と既存テスト一式・E2E 全件で担保する。

### プライバシー・法務への影響

戸籍データ・家系図データのフローは変わらない。クライアント完結・サーバ送信ゼロの制約に影響しない。

むしろ**制約を補強する**: `atoms/` `molecules/` を「`store/` や通信層を import しない層」として ESLint で固定することで、外部送信コードが混入しうる箇所が `organisms/` の一部に限定される。E2E(外部送信ゼロ検証)・CSP(`worker/index.ts`)に続く構造上の防波堤となる。

### ロールバック方針

- 4 段階(基本形 CSS → 層への移動 → atoms 適用 → 規律の固定)に分割し、段ごとに独立した PR とする。各段は前段に依存するが、**後段のみの revert が常に可能**
- データ移行・スキーマ変更・永続化形式の変更を含まないため、revert 時に利用者データへの影響は発生しない
- 各段の完了条件に `npm run lint` / `typecheck` / `test` / `build` の通過と視覚回帰なしを含め、段の途中で develop へマージしない
- 最終段では E2E 全件の通過と変更前後のスクリーンショット比較を archive の前提条件とする。デプロイ環境での確認は archive のゲートに含めない(振る舞い・視覚表現をゼロ変更する構造再編であり、検証がローカルで完結するため)
- 第 1 段(基本形 CSS)のみで重複解消の主目的は達成されるため、以降の段で問題が生じた場合は第 1 段までで打ち切る判断が可能

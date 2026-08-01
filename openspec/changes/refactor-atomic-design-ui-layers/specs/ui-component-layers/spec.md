## ADDED Requirements

### Requirement: UI コンポーネントの層構造

UI コンポーネントは Atomic Design の 5 層(`src/atoms/` / `src/molecules/` / `src/organisms/` / `src/templates/` / `src/pages/`)のいずれかに配置されなければならない(SHALL)。層の所属は部品の見た目の複雑さではなく、**依存の向き**によって決定されなければならない(SHALL)。

| 層 | 判定基準 |
| --- | --- |
| `atoms/` | `domain/` を import しない。ドメイン語彙を props に持たない |
| `molecules/` | `domain/` の型は知ってよい。`store/` を import しない。機能をまたいで 2 箇所以上から使われる |
| `organisms/<機能>/` | `store/` を購読してよい。1 つの機能に属する |
| `templates/` | レイアウトの骨組みを与え、状態を持たない |
| `pages/` | ルーティングと状態管理を担う |

`src/components/` `src/features/` `src/rendering/` `src/settings/`(UI 部分)は存在してはならない(MUST NOT)。

#### Scenario: 新しい汎用部品の置き場が一意に決まる

- **GIVEN** ドメイン型を props に持たず、状態も購読しない新しいボタン系部品を追加したい
- **WHEN** 開発者が層の判定基準を参照する
- **THEN** `src/atoms/` が置き場として一意に決まり、他の層の候補が残らない

#### Scenario: 機能をまたいで再利用される部品が共通層に置かれる

- **GIVEN** `ConfirmDialog` が `pages` / `person-edit` / `settings` / `import-export` / `tree-canvas` の 5 機能から使われている
- **WHEN** リポジトリの構造を確認する
- **THEN** `ConfirmDialog` は `src/molecules/` に配置されており、いずれかの機能ディレクトリの内部には存在しない

#### Scenario: 機能内でのみ再利用される部品は共通層に上げない

- **GIVEN** `ZoomControls` が 2 箇所から使われているが、いずれも `tree-canvas` 機能内である
- **WHEN** リポジトリの構造を確認する
- **THEN** `ZoomControls` は `src/organisms/tree-canvas/` に配置されており、`src/molecules/` には存在しない

### Requirement: 層間の依存規則の機械検証

層をまたぐ依存は静的解析によって禁止されなければならない(SHALL)。規則違反はローカルおよび CI の `npm run lint` で非ゼロ終了しなければならない(SHALL)。

禁止される依存:

- `atoms/` から `domain/` `store/` `persistence/` `lib/` への import
- `molecules/` から `store/` `persistence/` への import
- `atoms/` `molecules/` から `organisms/` `templates/` `pages/` への import(下位層は上位層を参照しない)
- `organisms/<機能A>/` から `organisms/<機能B>/` への import(機能間の直接依存を禁止し、共有が必要な部品は `molecules/` へ昇格させる)

#### Scenario: atoms がドメインを参照すると lint が落ちる

- **GIVEN** `src/atoms/` 配下のコンポーネント
- **WHEN** そのファイルに `import type { Person } from '../domain/types'` を追加して `npm run lint` を実行する
- **THEN** ESLint が層間依存の違反として報告し、非ゼロ終了する

#### Scenario: molecules が状態を購読すると lint が落ちる

- **GIVEN** `src/molecules/` 配下のコンポーネント
- **WHEN** そのファイルに `useTreeStore` の import を追加して `npm run lint` を実行する
- **THEN** ESLint が層間依存の違反として報告し、非ゼロ終了する

#### Scenario: 機能をまたぐ直接依存が lint で防がれる

- **GIVEN** `src/organisms/person-table/` のコンポーネント
- **WHEN** `src/organisms/tree-canvas/` のコンポーネントを直接 import して `npm run lint` を実行する
- **THEN** ESLint が機能間の直接依存として報告し、非ゼロ終了する

#### Scenario: 規則を満たす現行コードでは lint が通る

- **GIVEN** 本変更の適用後のリポジトリ
- **WHEN** `npm run lint` を実行する
- **THEN** 層間依存の違反は 0 件で、終了コードは 0 である

### Requirement: 見た目の基本形の単一情報源

ボタン・入力欄・面(サーフェス)・セグメント切替の見た目の基本形は `src/styles/primitives.css` にのみ定義されなければならない(SHALL)。`primitives.css` は `src/index.css` から `tokens.css` の直後に `@import` され、各コンポーネント CSS より先に適用されなければならない(SHALL)。

コンポーネント固有の CSS は、基本形(`cursor: pointer` と `border-radius` と `padding` を同時に指定する操作要素のスタイル)を新たに定義してはならない(MUST NOT)。差分が必要な場合は基本形を上書きする形で最小限の宣言のみを持つ。

#### Scenario: ボタンの手触りを 1 箇所の変更で全体に反映できる

- **GIVEN** アプリ内のボタンが `primitives.css` の基本形を共有している
- **WHEN** `primitives.css` のボタンの `border-radius` を変更する
- **THEN** 編集パネル・設定メニュー・確認ダイアログ・表形式ビュー・キャンバスのボタンすべてに変更が反映され、他の CSS ファイルを編集する必要がない

#### Scenario: 基本形の再定義が検証テストで防がれる

- **GIVEN** `primitives.css` 以外のコンポーネント CSS
- **WHEN** そのファイルに操作要素の基本形(`cursor: pointer` + `border-radius` + `padding`)を新規に定義して `npm run test` を実行する
- **THEN** CSS 検証テストが失敗し、非ゼロ終了する

#### Scenario: 適用順により コンポーネント CSS が基本形を上書きできる

- **GIVEN** `primitives.css` が `.btn` の背景色を定義している
- **WHEN** コンポーネント CSS が同じ詳細度で背景色を再指定する
- **THEN** コンポーネント CSS の指定が適用される(読み込み順が後のため)

### Requirement: 人物カードのスタイルの明示的な共有

人物カードのスタイル(`.tree-card` 系)は、カードを描画するすべての系統から明示的に import される単一のファイルに置かれなければならない(SHALL)。ある描画系が別の描画系の CSS へ暗黙に依存してはならない(MUST NOT)。

#### Scenario: つながった全体表示が単独でもカードのスタイルを得る

- **GIVEN** `PedigreeCanvas` がカードの HTML(`person-card.ts` 由来)を描画する
- **WHEN** `PedigreeCanvas` の import を確認する
- **THEN** カードのスタイルを持つ CSS を明示的に import しており、`FamilyTreeCanvas` の CSS が読み込まれているかどうかに依存しない

#### Scenario: 2 つの描画系のカード表現が一致し続ける

- **GIVEN** 表示設定(日付粒度・和暦/西暦・カード表示項目)が任意の組み合わせに設定されている
- **WHEN** 折りたたみ表示(family-chart)とつながった全体表示(`PedigreeCanvas`)の両方をレンダリングする
- **THEN** 描画された人物カードの DOM が一致する(既存の `card-consistency` テストが変更なしで通る)

### Requirement: 機能単位の凝集

1 つの機能に属する UI コンポーネント・機能固有の純関数・CSS は、`src/organisms/<機能>/` の単一ディレクトリに配置されなければならない(SHALL)。UI と、その UI のためだけに存在する純関数が別ディレクトリに分かれていてはならない(MUST NOT)。

#### Scenario: 表形式ビューの UI と列定義が同居する

- **GIVEN** 表形式ビューの列定義(`columns.ts`)と TSV 直列化(`tsv.ts`)は表形式ビューのためだけに存在する
- **WHEN** リポジトリの構造を確認する
- **THEN** `PersonTableView.tsx` と `columns.ts` と `tsv.ts` が `src/organisms/person-table/` に同居している

#### Scenario: インポート/エクスポートの UI とファイル入出力が同居する

- **GIVEN** `fileIO.ts`(サイズ上限・エクスポートファイル名生成)はインポート/エクスポート UI のためだけに存在する
- **WHEN** リポジトリの構造を確認する
- **THEN** `ImportExportControl.tsx` と `fileIO.ts` が `src/organisms/import-export/` に同居している

### Requirement: 状態管理を UI 層の外に置く

Zustand ストアおよびその型・既定値は `src/store/` に配置されなければならない(SHALL)。Atomic Design の 5 層の内部にストアを置いてはならない(MUST NOT)。

#### Scenario: 表示設定のストアが store 層にある

- **GIVEN** 表示設定は端末ローカル(localStorage)に保持される
- **WHEN** リポジトリの構造を確認する
- **THEN** 表示設定のストアと型・既定値は `src/store/` にあり、家系図ストアと並んでいる。`src/organisms/settings/` は UI のみを持つ

### Requirement: 構造再編による振る舞いの不変

本変更は UI の振る舞い・視覚表現・アクセシビリティ名を変更してはならない(MUST NOT)。既存のすべてのテストが、import パスの変更のみで通らなければならない(SHALL)。

#### Scenario: 和暦入力の振る舞いが変わらない

- **GIVEN** `WarekiDateInput` が `src/molecules/` へ移動している
- **WHEN** 人物の生年に「明治三十三年一月一日」のような和暦・漢数字表記を入力する
- **THEN** 移動前と同一の解釈結果(`FuzzyDate`)が得られ、和暦・西暦の表示切替も移動前と同一に動作する

#### Scenario: 複雑な家族関係の編集が変わらない

- **GIVEN** `PersonPanel` が `src/organisms/person-edit/` へ移動している
- **WHEN** 養子縁組・再婚・複数配偶者を含む家系図で、配偶者・子・親の追加および既存人物との紐づけを行う
- **THEN** 関係先候補の絞り込み(循環の防止・既存関係の除外・ひとり親家族への合流)が移動前と同一に動作する

#### Scenario: 旧字体・異体字を含む氏名の表示が変わらない

- **GIVEN** 氏名に旧字体・異体字を含む人物が存在する
- **WHEN** 編集パネル・表形式ビュー・人物カードで氏名を表示する
- **THEN** 移動前と同一の文字列が表示され、エスケープの扱いも変わらない

#### Scenario: 品質チェックが通る

- **GIVEN** 各段の実装が完了している
- **WHEN** `npm run lint` / `npm run format:check` / `npm run typecheck` / `npm run test` / `npm run build` / `npm run test:e2e` を実行する
- **THEN** すべて終了コード 0 で完了する

#### Scenario: 視覚回帰がないことをスクリーンショットで確認できる

- **GIVEN** 主要画面(空状態・編集パネル・表形式ビュー・3 表示モード・設定メニュー・確認ダイアログ・ランディング)
- **WHEN** ライト/ダーク両テーマでスクリーンショットを取得し、変更前(`develop`)の同一画面と比較する
- **THEN** 見た目に差異がない

### Requirement: ルート単位のコード分割の維持

`App.tsx` を `templates/` と `pages/` に分離した後も、ランディングページの初回表示でエディタ用の重い依存(family-chart / D3)を読み込んではならない(MUST NOT)。

#### Scenario: ランディングのチャンクにエディタの依存が含まれない

- **GIVEN** `Root.tsx` がルート単位で遅延読み込みを行っている
- **WHEN** `npm run build` を実行し、生成されたチャンク構成を確認する
- **THEN** ランディングの初回表示に必要なチャンクに family-chart / D3 が含まれない

#### Scenario: 骨組みが状態を持たない

- **GIVEN** `src/templates/AppShell.tsx`
- **WHEN** その実装を確認する
- **THEN** `useState` 等による状態を持たず、ヘッダ・キャンバス・パネルの配置とスロットのみを担う。状態管理は `src/pages/AppPage.tsx` にある

### Requirement: 層構造の README への記載

README.md の「開発者向け情報 > アーキテクチャ」は、5 層の役割と層間の依存規則を記載しなければならない(SHALL)。既存の `src/layout/`(座標計算エンジン)と新設の `src/templates/`(UI の骨組み)の役割の違いを明記しなければならない(SHALL)。

#### Scenario: 新規参加者が置き場を判断できる

- **WHEN** README.md のアーキテクチャ節を読む
- **THEN** 新しい UI 部品をどの層に置くべきかが、層の判定基準の記載のみで判断できる

#### Scenario: layout と templates の違いが判別できる

- **WHEN** README.md のアーキテクチャ節を読む
- **THEN** `src/layout/` が家系図の座標を計算する純関数群であり、`src/templates/` が画面の骨組みを与える React コンポーネントであることが区別できる

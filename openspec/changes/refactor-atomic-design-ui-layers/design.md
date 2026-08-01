## Context

現状の UI は 3 つの分類軸が混在している。

- **レイヤ軸**: `domain/` `store/` `persistence/` `layout/` `lib/`(UI なし)
- **機能軸**: `features/`(UI を持たない純関数のみ)、`rendering/` `settings/`(純関数・状態・UI が同居)
- **粒度なし**: `components/`(19 コンポーネントがフラット。汎用部品・ドメイン部品・機能画面が混在)

`features/person-table/` が純関数だけを持ち UI が `components/PersonTableView.tsx` にある、という機能の分断もここから生じている。

一方で、UI 部品の依存関係を実測すると **3 層が既に潜在している**。26 個の UI コンポーネントを「`store/` を購読するか / `domain/` を知るか」で分類すると:

| 分類 | store | domain | 該当 |
| --- | --- | --- | --- |
| 汎用 | ✗ | ✗ | `ConfirmDialog` `PersonNameFields` `SettingsMenu` `ZoomControls` `EmptyStateGhostPreview` + ランディング 4 部品 |
| ドメイン部品 | ✗ | ✓ | `PersonEditForm` `PersonPicker` `WarekiDateInput` |
| 機能画面 | ✓ | ✓ | `PersonPanel` `PersonTableView` `FamilyTreeCanvas` `PedigreeCanvas` 他 14 |

`PersonEditForm` が `onSave` を props で受け、`PersonPicker` が `candidates` を props で受けているのは偶然ではない。「この部品は状態を持たない」という判断が既に下されている。**設計は存在しており、フォルダがそれを表現していない**のが現状である。

### データフロー(本変更による変化)

なし。本変更は UI コンポーネントの配置と CSS の重複解消のみを行う。

- 家系図データ: `IndexedDB`(クライアント)のみ。変更なし
- 表示設定: `localStorage`(クライアント)のみ。変更なし
- サーバ・外部 API への送信: **なし**(現状ゼロ、本変更後もゼロ)
- Supabase / Gemini API: 本変更では一切使用しない(有償版の課題であり本 change の scope 外)

`atoms/` `molecules/` を「`store/` および通信層を import しない層」として ESLint で固定するため、送信ゼロ制約に対しては**構造上の防波堤が 1 層増える**方向の変化となる。

## Goals / Non-Goals

**Goals:**

1. ボタン・入力・面・セグメント切替の見た目を 1 箇所の変更で全体に反映できる状態にする
2. UI 部品の置き場が判断で迷わず決まる状態にする(層の境界を機械判定可能にする)
3. 1 つの機能に属するファイル(UI・機能固有の純関数・CSS)を 1 箇所に集約する
4. 有償版で再利用できる UI 層(`atoms/` `molecules/`)を、ドメイン・状態・通信から独立した形で確立する
5. 上記 1〜4 の規律が後から崩れないよう、機械検証で固定する

**Non-Goals:**

- 見た目・振る舞い・アクセシビリティ名の変更(**視覚回帰ゼロが完了条件**)
- `person-card.ts` の React コンポーネント化(判断を保留したまま進められる設計とする)
- `src/layout/`(座標計算エンジン)の改名・再編
- `domain/` `persistence/` `lib/` `samples/` `worker/` の構造変更
- CSS Modules・CSS-in-JS・UI ライブラリの導入(素のグローバル CSS + トークンの現行方式を維持)
- ランディングページ(`pages/landing/`)の部品を共通層へ引き上げること
- 有償版の UI 実装

## Decisions

### D1: 層の境界は「見た目の複雑さ」ではなく「依存の向き」で定義する

Atomic Design の層を「部品の見た目の複雑さ」で分けると境界が主観になり、`ConfirmDialog`(汎用の再利用部品だがフォーカス管理を持つ自律的な部品)のような部品で必ず議論が発生する。

本設計では境界を `import` で判定する:

| 層 | 判定基準 |
| --- | --- |
| `atoms/` | `domain/` を import しない。ドメイン語彙(`Person` `FuzzyDate` 等)を props に持たない |
| `molecules/` | `domain/` の型は知ってよい。`store/` を import しない。機能をまたいで 2 箇所以上から使われる |
| `organisms/<機能>/` | `store/` を購読してよい。1 つの機能に属する |
| `templates/` | レイアウトの骨組み。状態を持たない |
| `pages/` | ルーティングと状態管理 |

**採用理由**: 判定が `import` 文で機械化でき、ESLint で強制できる。実測(Context 参照)でこの基準が既存コードと矛盾しないことを確認済み。

**代替案**: 見た目の複雑さで分類する(原典寄り) → 境界が主観になり、部品追加ごとに判断コストが発生するため却下。

### D2: `organisms/` の内部を機能単位で切り、`features/` を廃止する

`organisms/` をフラットにすると `components/` のフラット問題が名前を変えて再発する。また `features/person-table/columns.ts` のような「機能に属する純関数」の置き場が Atomic Design の 5 層のどこにも収まらない。

```
organisms/
├── person-edit/     PersonPanel, PersonEditForm, PedigreeEditor,
│                    FamilyEventEditor, DeletePersonControl, UnlinkRelationControl
├── person-table/    PersonTableView + columns.ts + tsv.ts        ← 機能の分断を解消
├── import-export/   ImportExportControl + fileIO.ts              ← 機能の分断を解消
├── tree-canvas/     FamilyTreeCanvas, PedigreeCanvas, person-card.ts,
│                    to-family-chart-data.ts, ZoomControls,
│                    UnconnectedTray, AddPersonControl
├── settings/        SettingsMenu, DisplaySettingsControl, DataResetControl
└── onboarding/      EmptyStateGuide, EmptyStateGhostPreview
```

Atomic Design の原典は organisms の内部構成を規定していないため、この分割は原典と矛盾しない。`rendering/` と `settings/` は既にこの形(機能ごとにレイヤ横断で同居)であり、**新しい規律ではなく既存の規律の徹底**にあたる。

### D3: 見た目の基本形は React コンポーネントではなく CSS 層に置く

アプリの主役である人物カードは React コンポーネントではない。`person-card.ts` が HTML 文字列を生成し、family-chart(DOM 直挿入)と `PedigreeCanvas`(`dangerouslySetInnerHTML`)の 2 系統が描画している。

```
  derivePersonCardView() ─→ personCardInnerHtml() ─→ HTML 文字列
                                                       │
                              ┌────────────────────────┴──────────────┐
                              ▼                                       ▼
                  FamilyTreeCanvas(family-chart が挿入)        PedigreeCanvas
```

**`<Button>` のような React プリミティブはこの経路に一切届かない。** したがって基本形の単一情報源は `src/styles/primitives.css`(CSS)とし、React 側の `atoms/` はその CSS を使う薄いラッパとして後段で作る。

Brad Frost の原典における atoms は「HTML 要素とそのスタイル」であり React コンポーネントとは規定されていないため、この判断は原典と整合する。

**副作用として実バグを 1 件解消する**: 現在 `.tree-card` 系のスタイルは `FamilyTreeCanvas.css` にのみ存在し、`PedigreeCanvas.tsx` は `PedigreeCanvas.css` だけを import しながらカードの見た目を暗黙に借りている(`PedigreeCanvas.css` のコメントに「流用する」と明記)。同一チャンクに両方が含まれるため現状は動作するが、依存が import にも型にも現れていない。`.tree-card` 系を `organisms/tree-canvas/person-card.css` へ切り出し、両キャンバスが明示的に import する形に改める。

### D4: `primitives.css` は `index.css` から `tokens.css` の直後に `@import` する

素のグローバル CSS のため、詳細度と読み込み順で上書きの勝敗が決まる。コンポーネント CSS が基本形を上書きできる状態を保証する必要がある。

```
index.css
├── @import './styles/tokens.css'       (既存・色と間隔)
├── @import './styles/primitives.css'   (新設・基本形)
└── 要素セレクタのリセット
        ↓ 常に後に来る
   各コンポーネント CSS(Vite が component import 順で挿入)
```

`tokens.css` が既にこの方式で確定順を得ているため、同じ仕組みに乗せる。コンポーネント側は `.btn` 等を必要に応じて上書きでき、上書きが不要なら宣言を持たない。

**代替案**: `@layer` を使う → 上書き規則はより明快になるが、既存 22 ファイルすべてを `@layer` 化しないと混在状態が生まれ、かえって順序が読めなくなるため却下。

### D5: 状態(store)は Atomic 層の外に出す

Atomic Design の 5 層は UI の分類軸であり、状態管理は層の対象外である。`settings/display-settings-store.ts` と `settings/display-settings.ts`(型・既定値)は `src/store/` へ移し、`tree-store.ts` と並べる。

これにより `organisms/settings/` は UI だけを持つ。

### D6: `molecules/` への昇格条件は「機能をまたいで 2 箇所以上」

`store` 非依存だけを条件にすると、1 箇所でしか使わない部品も `molecules/` に溜まり、共通層が実質フラットな置き場に退化する。

実測に基づく判定:

| 部品 | 利用箇所 | 判定 |
| --- | --- | --- |
| `ConfirmDialog` | 7(`pages` / `person-edit` / `settings` / `import-export` / `tree-canvas` をまたぐ) | `molecules/` |
| `PersonNameFields` | 4(`person-edit` / `onboarding` / `tree-canvas` をまたぐ) | `molecules/` |
| `PersonPicker` | 3(`person-edit` / `tree-canvas` をまたぐ) | `molecules/` |
| `WarekiDateInput` | 2(`person-edit` 内 2 箇所) | `molecules/`(和暦入力は有償版 OCR 校正で確実に再利用されるため例外的に昇格) |
| `person-name.ts` | 3(`person-edit` / `onboarding` / `tree-canvas` をまたぐ) | `molecules/` |
| `ZoomControls` | 2(いずれも `tree-canvas` 内) | `organisms/tree-canvas/`(機能をまたがない) |
| `PersonEditForm` | 1(`PersonPanel` のみ) | `organisms/person-edit/`(下記) |
| `SettingsMenu` | 1(`AppPage` のみ・器のみで依存ゼロ) | `organisms/settings/` |
| `EmptyStateGhostPreview` | 1(`EmptyStateGuide` のみ) | `organisms/onboarding/` |

### D7: `PersonEditForm` は昇格させず、2 箇所目が生まれた時点で昇格する

`PersonEditForm` は `store` 非依存・props 駆動で `molecules/` の設計要件を満たしているが、現在の利用は `PersonPanel` の 1 箇所のみ。有償版の OCR 校正 UI で再利用が見込まれるが、**憶測で先に動かさない**。`organisms/person-edit/` に置き、2 箇所目の利用が生まれた時点で昇格させる(import 元が 1 箇所のため昇格コストは小さい)。

### D8: `templates/` と既存 `layout/` は改名せず、役割の明記で区別する

`src/layout/` は「つながった全体表示」の座標計算エンジン(世代割当・層内順序・座標・系線)であり、UI のレイアウトではない。新設する `templates/` と名前が紛らわしいが、`layout/` は 14 ファイル・テスト込みで大きく、改名は本変更の scope を膨らませる。

README と本ドキュメントで役割を明記して区別する:

- `src/layout/` = 家系図の**座標を計算する**純関数群(フレームワーク非依存)
- `src/templates/` = 画面の**骨組みを与える** React コンポーネント(状態なし)

### D9: `App.tsx` の分離時にルート単位のコード分割を壊さない

`Root.tsx` は `lazy(() => import('./App'))` でエディタを遅延読み込みし、ランディング初回表示で family-chart / D3 を読み込ませない構造になっている(既存 design.md D2)。

`App.tsx` を `templates/AppShell.tsx` と `pages/AppPage.tsx` に分離する際、`Root.tsx` の遅延境界は `pages/AppPage` へ移す。`AppShell` は `AppPage` からのみ import されるため、同じチャンクに入りランディング側へ漏れない。

**完了条件にビルド後のチャンク構成の確認を含める**(ランディングのエントリチャンクに family-chart が含まれないこと)。

### D10: ランディングページの部品は共通層へ引き上げない

`pages/landing/`(`FeatureIcon` `SampleGallery` `TreeFigure` `figures.ts`)は family-chart 非依存の軽量 SVG 図版で、エディタと共有する部品が現状ない。`pages/landing/` に閉じたままとし、ランディングだけを独立して差し替える自由を残す。

### D11: 規律は機械検証で固定する

構造を整えても検証がなければ再び散る。既存の `components/tokens-contrast.test.ts` が `fs` で CSS 実ファイルを読んで検証する先例を持つため、同じ手法を使う。

1. **ESLint(`no-restricted-imports`)による層間依存の禁止**
   - `atoms/` → `domain/` `store/` `persistence/` `lib/` を禁止
   - `molecules/` → `store/` `persistence/` を禁止
   - `atoms/` `molecules/` → `organisms/` `templates/` `pages/` を禁止(下位層が上位層を参照しない)
   - `organisms/<機能A>/` → `organisms/<機能B>/` を禁止(機能間の直接依存を防ぎ、共有は `molecules/` へ昇格させる)
2. **CSS 検証テスト(`styles/primitives.test.ts`)**
   - `primitives.css` 以外の CSS が、ボタン・入力の基本形(`cursor: pointer` と `border-radius` と `padding` の同時指定)を新たに定義していないことを検査する
   - 検査対象から除外するファイルはテスト内に明示列挙し、除外の追加がレビューで見えるようにする

## 移行計画(4 段階)

各段で **diff の性質を混ぜない**ことを原則とする。段ごとに独立した PR とし、`develop` へのマージは段の完了時のみ行う。

```
第1段  基本形 CSS の新設        触るファイル: *.css のみ(tsx ゼロ)
       styles/primitives.css     レビュー観点: 見た目の視覚確認
       各CSSから重複宣言を削除   これ単独で Goal 1 を達成する
              ↓
第2段  層への移動               触る内容: ファイル移動と import パスのみ
       atoms/ molecules/         レビュー観点: パスの正しさ(見た目ゼロ変更)
       organisms/ templates/     これで Goal 2・3 を達成する
       pages/ + store/ へ集約
              ↓
第3段  atoms の適用             触る内容: tsx の中身
       Button/Field/Surface/     レビュー観点: 各コンポーネントの振る舞い
       Dialog/SegmentedControl   セグメント切替 6箇所 → 1部品
              ↓
第4段  規律の固定               追加: ESLint ルール・CSS 検証テスト
       ESLint + 検証テスト       README のアーキテクチャ節を更新
```

**順序の理由**: 第 1 段(CSS)は tsx を触らないため diff が独立し、視覚確認だけでレビューできる。第 2 段(移動)は見た目を一切変えないため機械的にレビューできる。両者を逆順にすると、移動直後に再び全ファイルの CSS を触ることになり 2 度手間になる。第 3 段は構造が確定した上で行う。

**ロールバック**: データ移行・スキーマ変更を含まないため、任意の段を revert しても利用者データへの影響はない。第 1 段のみで重複解消という主目的は達成されるため、以降の段で問題が生じた場合は第 1 段までで打ち切る判断が可能。

**ブランチ運用**: CLAUDE.md に従い、雛形作成から archive まで `claude/refactor-atomic-design-ui-layers` の 1 本で行う。各段の PR ごとに同ブランチを最新の `develop` へ reset して出し直す。

**検証と archive のタイミング**: 本変更は振る舞い・視覚表現をゼロ変更する構造再編であり、検証はローカルで完結する(E2E 全件 + 変更前後のスクリーンショット比較)。したがって dev/本番環境へのデプロイ確認を archive の前提とせず、最終段の検証が通った時点で spec を同期して archive し、その PR を出す。デプロイ環境での確認が必要になった場合は、`develop` へのマージ後に別途行う。

## Risks / Trade-offs

| リスク | 影響 | 緩和策 |
| --- | --- | --- |
| diff が巨大(実装 8,355 行 + テスト 7,044 行が影響圏)でレビュー不能になる | レビュー品質の低下・見落とし | 4 段階に分割し、各段で触るファイルの**種類**を限定する(第 1 段は CSS のみ、第 2 段は import パスのみ) |
| CSS の上書き順序が壊れ、見た目が退行する | 視覚回帰 | D4 の読み込み順を守る。第 1 段の完了条件に主要画面の視覚確認を含める。既存テスト一式(`getByRole` 361 箇所)は構造非依存のため退行検知の一部を担う |
| ファイル移動でテストが壊れる | CI 赤化 | 実測でリスクは低い(`toHaveClass` 0 箇所、クラス名依存 `querySelector` 19 箇所のみ)。テストは対応する実装と同じ層へ同時移動し、19 箇所は個別に確認する |
| `App.tsx` 分離でコード分割が壊れ、ランディングが family-chart を読み込む | ランディングの初回描画が劣化 | D9。完了条件にビルド後のチャンク構成確認を含める |
| `atoms/` の粒度が過剰になり、素の HTML で足りる場所にラッパが増える | 可読性の低下 | 第 3 段の対象を実測で重複が確認された 5 部品(`Button` `Field` `SegmentedControl` `Surface` `Dialog`)に限定する。新規 atom の追加は「2 箇所以上の重複」を条件とする |
| `templates/` と `layout/` の名前の紛らわしさが残る | 新規参加者の混乱 | D8。README とディレクトリ冒頭コメントで役割を明記する。将来 `layout/` を `pedigree-layout/` へ改名する余地は残す |
| 層の規律が時間とともに崩れる | 元の状態への回帰 | D11(ESLint + CSS 検証テスト)。CI の必須チェック(ジョブ ID `quality`)に含める |
| 第 3 段で `SegmentedControl` に統合する 6 箇所の aria 属性・キーボード挙動に差異があり、統合で挙動が変わる | アクセシビリティの退行 | 統合前に 6 箇所の `role` / `aria-label` / `aria-pressed` / フォーカス順を洗い出して差分表を作り、統合後も各箇所のテスト(既存の `getByRole` ベース)が変更なしで通ることを条件とする |

## Open Questions

1. **`person-card.ts` の React 化**: 本変更では判断を保留する(D3 により保留したまま完結できる)。将来 React 化する場合、`primitives.css` の基本形はそのまま再利用でき、`atoms/Surface` の上にカードを組み直す形になる。判断時期は有償版の OCR 校正 UI を設計するタイミングが自然。
2. **`layout/` の改名**: 本変更では行わない。`templates/` との紛らわしさが実際に混乱を生むかを運用で観察し、必要なら別 change として `pedigree-layout/` への改名を提案する。
3. **`SettingsMenu` の層**: 依存ゼロの「器」であり `atoms/` の判定基準(`domain/` を import しない)を満たすが、実質は設定機能の入れ物である。本設計では機能への所属を優先して `organisms/settings/` に置く。この「依存はゼロだが機能に属する器」というケースが他にも現れた場合、判定基準に「機能固有の子部品を組み立てる器は organisms とする」旨を追記する必要がある。

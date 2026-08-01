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
第1段  基本形の新設と適用        触る内容: primitives.css の新設、各コンポーネントの
       styles/primitives.css     className への基本形クラス付与、各CSSの差分化
       + className 付与          レビュー観点: 見た目の視覚確認
       + 各CSSを差分のみへ       これ単独で Goal 1 を達成する
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

**順序の理由**: 第 1 段は「見た目に触る唯一の段」であり、レビューは視覚確認に集中できる。第 2 段(移動)は見た目を一切変えないため機械的にレビューできる。両者を逆順にすると、移動直後に再び全ファイルの CSS を触ることになり 2 度手間になる。第 3 段は構造が確定した上で行う。

**第 1 段が `*.tsx` にも及ぶ理由**: 素の CSS には mixin がないため、集約した基本形を効かせるには (a) 各コンポーネントの `className` に基本形クラスを付ける、(b) `primitives.css` 側に既存クラス名を列挙したセレクタリストを書く、のいずれかが必要になる。(b) は共通ファイルが全コンポーネントのクラス名を知ることになり依存が逆流するため、(a) を採る。したがって第 1 段は `*.css` に加えて各コンポーネントの `className` を変更する。テストは `getByRole` / `ByLabelText` ベース(`toHaveClass` は 0 箇所)のため、クラス付与による影響を受けない。

**ロールバック**: データ移行・スキーマ変更を含まないため、任意の段を revert しても利用者データへの影響はない。第 1 段のみで重複解消という主目的は達成されるため、以降の段で問題が生じた場合は第 1 段までで打ち切る判断が可能。

**ブランチ運用**: CLAUDE.md に従い、雛形作成から archive まで `claude/refactor-atomic-design-ui-layers` の 1 本で行う。各段の PR ごとに同ブランチを最新の `develop` へ reset して出し直す。

**検証と archive のタイミング**: 本変更は振る舞い・視覚表現をゼロ変更する構造再編であり、検証はローカルで完結する(E2E 全件 + 変更前後のスクリーンショット比較)。したがって dev/本番環境へのデプロイ確認を archive の前提とせず、最終段の検証が通った時点で spec を同期して archive し、その PR を出す。デプロイ環境での確認が必要になった場合は、`develop` へのマージ後に別途行う。

## Risks / Trade-offs

| リスク | 影響 | 緩和策 |
| --- | --- | --- |
| diff が巨大(実装 8,355 行 + テスト 7,044 行が影響圏)でレビュー不能になる | レビュー品質の低下・見落とし | 4 段階に分割し、各段で**変更の性質**を限定する(第 1 段は見た目の集約のみ・機能変更なし、第 2 段はファイル配置と import パスのみ・見た目ゼロ変更) |
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

## 付録 B: 視覚回帰の検証方法と結果

### 方法 — 計算後スタイルの突き合わせ

スクリーンショットのピクセル比較だけでは「なぜ変わったか」が分からず、符号化差にも左右される。本変更で崩れうるのは `font-size` / `line-height` / `padding` / `border` / `border-radius` / `background` / `box-shadow` といった具体的なプロパティなので、**実ブラウザで `getComputedStyle` を突き合わせる**方法を採った。

- 対象: 8 画面(ランディング / 空状態 / 図 / 編集パネル / 関係追加フォーム / 表(編集モード) / 設定メニュー / 確認ダイアログ)× ライト・ダークの 2 テーマ = **16 画面**
- 各画面で基本形を当てた要素を選択し、**176 要素 × 40 プロパティ**(寸法 `getBoundingClientRect` を含む)を採取
- `develop` と本ブランチで同一手順を実行し、全値を機械比較

計測時の注意(初回の実行で偽の差分を生んだため対策済み):

- クリック直後はマウスが要素上に残り `:hover` が混ざる → 採取前に `mouse.move(0, 0)` でホバーを外す
- `index.css` の `button { transition: ... }` の途中で `getComputedStyle` を読むと**中間値**が返る → 400ms の静定待ちを入れる

### 結果

最終比較で **差分 0 件**(16 画面 / 176 要素 / 40 プロパティ)。

### 検証によって発見・修正した実際の回帰 2 件

いずれも「プリミティブが子孫セレクタを使い、コンポーネント側の 1 クラスのルールより詳細度が高くなる」ことが原因だった。**この教訓は第 3 段以降にも効く**ため記録する。

1. **`.segmented > button` が各所の `font-size` / `line-height` を上書きしてしまった**
   `.segmented > button`(詳細度 0,1,1)の `font: inherit` が `.tree-show-all-toggle`(0,1,0)の `font-size: var(--text-sm)` に勝ち、表示モード切替の文字が 14px → 16px、高さが 37px → 41px になっていた。
   → プリミティブの子は**単一クラス `.segmented-item`** で定義し、コンポーネント側(同詳細度・後読み込み)が必ず勝てるようにした。並びごとの区切り線・面のように各所で上書きしない性質のものだけ子孫セレクタに残す。

2. **セグメントの選択状態が並びごとの面指定に負けた**
   `.segmented-item[aria-pressed='true']`(0,2,0)と `.segmented--framed > .segmented-item`(0,2,0)が同詳細度で、後者が後にあったため選択中の背景が `--ai-wash` から `--paper` へ退行していた(ヘッダの図/表、表の閲覧/編集)。
   → 選択状態の規則をセグメント定義の**最後**に置いた。

### 偽陽性として棄却した差分 1 件

`.person-panel-action-button[aria-pressed='true']` の色が `develop` 側で基本形の値に見えていたが、これはトランジション途中の中間値を読んでいたためで、同画面のスクリーンショットは両版で完全に一致していた。上記の静定待ちを入れた後は差分が出ない。

## 付録 A: 基本形と差分の分類(tasks 1.1 の成果物)

`src/` 配下の CSS 全 25 ファイル・2,926 行を読み、操作要素(ボタン・入力)・面・セグメント切替に関わる全宣言を「基本形へ集約」と「各コンポーネントに残す差分」へ分類した。

分類対象外のファイル: `tokens.css`(トークン定義そのもの)、`index.css`(要素セレクタのリセット。基本形の土台)、`PedigreeCanvas.css`(系線・キャンバス土台のみで操作要素・面を持たない)。

### A-1. ボタン — `.btn` とバリアント

基本形(全バリアント共通): `font: inherit` / `cursor: pointer` / `border-radius: var(--radius)` / `border: 1px solid transparent` / `background: none`

| バリアント | 基本形へ集約する宣言 | 該当セレクタ(ファイル) | 各所に残す差分 |
| --- | --- | --- | --- |
| `.btn--outline` | `border-color: var(--line-strong)` `background: var(--paper)` `color: var(--ink-soft)` | `.person-panel-close` `.person-panel-action-button` `.person-panel-relation-modes button` `.person-panel-relation-actions button[type=button]`(PersonPanel) / `.add-person-actions button[type=button]`(AddPersonControl) / `.confirm-dialog-actions button`(confirm-dialog) / `.app-blocked-reload`(App) / `.person-table-clear-filters`(PersonTableView) | `font-size` `padding` / hover 色(藍 or 墨) / `color: var(--ink)`(action-button) / `background: var(--paper-raised)`(app-blocked-reload) / `flex` `min-width` `align-self` |
| `.btn--primary-soft` | `border-color: var(--ai)` `background: var(--ai-wash)` `color: var(--ai-strong)` | `.person-panel-relation-actions button[type=submit]`(PersonPanel) / `.add-person-actions button[type=submit]`(AddPersonControl) / `.person-edit-form-submit`(PersonEditForm) | `font-size` `padding` `align-self` / hover の `border-color` |
| `.btn--primary` | `border-color: var(--ai)` `background: var(--ai)` `color: var(--paper)` + hover `background: var(--ai-strong)` | `.confirm-dialog-primary-button`(confirm-dialog) / `.empty-state-guide-form button`(EmptyStateGuide) | `padding` / `border-radius: 999px`(ピル形) / disabled の淡色化 |
| `.btn--danger` | `border-color: var(--danger)` `background: var(--danger)` `color: var(--paper)` | `.confirm-dialog-danger-button`(confirm-dialog) | hover の `color-mix` |
| `.btn--danger-outline` | `border-color: var(--danger)` `color: var(--danger)` + hover `background: var(--danger-wash)` | `.delete-person-trigger`(DeletePersonControl) | `font-size` `padding` `align-self` |
| `.btn--text` | `border: none` + hover 背景のみ利用側で指定 | `.unlink-relation-trigger`(UnlinkRelationControl) / `.family-event-editor-delete`(FamilyEventEditor) / `.person-table-paste-summary-close` `.person-table-sort-button`(PersonTableView) | `color`(墨 / 朱 / `inherit`) / `padding` / hover 背景 / `font-weight: inherit` `padding: 0`(sort-button) |
| `.btn--menu-item` | `.btn--text` + `display: block` `width: 100%` `text-align: left` `padding: var(--space-2)` | `.data-reset-trigger`(DataResetControl) / `.import-export-trigger`(ImportExportControl) | `color`(朱 / 墨) / hover 背景(`--danger-wash` / `--ai-wash`) |
| `.btn--ghost` | `border-color: transparent` `color: var(--ink-soft)` + hover `border-color: var(--line-strong)` | `.settings-menu-trigger`(SettingsMenu) | `font-size` `line-height: 1` `padding` / `[aria-expanded=true]` の扱い |
| `.btn:disabled` | `opacity: 0.5` `cursor: not-allowed` | `.add-person-actions button[type=submit]` / `.person-panel-relation-actions button[type=submit]` / `.confirm-dialog-actions button` / `.person-table-sort-button`(`opacity: 0.6`) | `opacity: 0.6`(sort-button のみ) / disabled 時の配色変更(EmptyStateGuide) |

`index.css` の `button { transition: ... }` が全ボタンに効いているため、`.zoom-controls button` と `.tree-show-all-toggle` が個別に持つ `transition`(グローバル指定の部分集合)は**冗長であり削除する**。

### A-2. 入力欄 — `.field` とサイズバリアント

基本形: `font: inherit` / `border: 1px solid var(--line-strong)` / `border-radius: var(--radius)` / `background: var(--paper-raised)` / `color: var(--ink)`

| バリアント | 基本形へ集約する宣言 | 該当セレクタ(ファイル) | 各所に残す差分 |
| --- | --- | --- | --- |
| `.field`(既定 = `--text-md`) | 上記 + `font-size: var(--text-md)` `padding: var(--space-2)` | `.person-name-fields input`(PersonNameFields) / `.wareki-date-input input`(WarekiDateInput) / `.family-event-editor-field input`(FamilyEventEditor) / `.person-edit-form-*` の `input` `select` `textarea`(PersonEditForm) | `width: 8em`(氏名) / `box-sizing` `width: 100%` / `select` の `appearance: none` と矢印の背景画像 |
| `.field--sm` | `font-size: var(--text-sm)` `padding: var(--space-1) var(--space-2)` | `.person-picker input`(PersonPicker) / `.pedigree-editor-row select`(PedigreeEditor) / `.person-table-filter input`(PersonTableView) | `width: 100%` `box-sizing` / `min-width: 200px`(横断検索) |
| `.field--xs` | `font-size: var(--text-xs)` `padding: 2px var(--space-1)` | `.person-table-filter-row input` `select`(PersonTableView) | `width: 100%` `min-width: 5em` `box-sizing` / `::placeholder` の色 / `:focus-visible` の `border-color` |
| `.field--sunken` | `background: var(--paper)`(面が `--paper-raised` の中に置く入力) | `.confirm-dialog input`(confirm-dialog) | `padding` |
| `.field--bare` | `border: none` `padding: 0` `background: var(--paper-raised)` | `.person-table tbody td input` `select`(PersonTableView) | `width: 100%` `min-width: 8em` `box-sizing` / `:focus-visible { outline: none }` |

`.wareki-date-input input[aria-invalid='true'] { border-color: var(--danger) }` は基本形へ `.field[aria-invalid='true']` として集約する(和暦入力の解釈失敗表示。他の入力にも同じ規則を適用したい性質のため)。

### A-3. 面 — `.surface` とバリアント

| バリアント | 基本形へ集約する宣言 | 該当セレクタ(ファイル) | 各所に残す差分 |
| --- | --- | --- | --- |
| `.surface--floating` | `background: var(--paper-raised)` `border: 1px solid var(--line-strong)` `border-radius: var(--radius-lg)` `box-shadow: var(--shadow-floating)` | `.settings-menu-panel`(SettingsMenu) / `.confirm-dialog`(confirm-dialog) / `.person-picker-list`(PersonPicker) / `.landing-hero-figure`(LandingPage) | `padding` / `min-width` `max-width` `max-height` / `border-radius: var(--radius)`(picker-list) / `border-color: var(--line)`(hero-figure) / 位置指定 |
| `.surface--raised` | `background: var(--paper-raised)` `border: 1px solid var(--line)` `border-radius: var(--radius-lg)` `box-shadow: var(--shadow-raised)` | `.add-person-form`(AddPersonControl) / `.feature-card` `.sample-gallery-panel`(LandingPage) / **`.tree-card`**(FamilyTreeCanvas) | `padding` / hover の浮き上がり / カード寸法(`--tree-card-w/h`)・選択・故人の各状態 |
| `.surface--sunken` | `background: var(--paper-sunken)` `border: 1px solid var(--line)` `border-radius: var(--radius)` `padding: var(--space-3)` | `.person-edit-form`(PersonEditForm) / `.person-panel-relation-form`(PersonPanel) | なし(2 箇所は完全一致) |
| `.surface--overlay` | `border: 1px solid var(--line)` `border-radius: var(--radius-lg)` `background: color-mix(in srgb, var(--paper-raised) 88%, transparent)` `backdrop-filter: blur(8px)` `-webkit-backdrop-filter: blur(8px)` `box-shadow: var(--shadow-raised)` | `.zoom-controls`(ZoomControls) / `.tree-legend` `.tree-view-mode-toggle` `.tree-person-search-trigger`(FamilyTreeCanvas) / `.add-person-trigger`(AddPersonControl) | `border-radius: var(--radius)`(add-person-trigger のみ) / 位置・`z-index` / `overflow: hidden` |
| `.surface--notice` | `border: 1px solid` `border-radius: var(--radius)` `color: var(--ink)` | `.import-export-disabled-note` `.import-export-confirm`(ImportExportControl) / `.app-sample-error` `.app-blocked-message`(App) | 色の別(`--warn` / `--danger` と対応する `-wash`) / `padding` `font-size` `max-width` `margin` |
| `.surface--fieldset` | `border: 1px solid var(--line)` `border-radius: var(--radius)` `padding: var(--space-2) var(--space-3) var(--space-3)` + `legend` の `font-family: var(--font-gothic)` `font-size: var(--text-xs)` `color: var(--ink-faint)` `padding: 0 var(--space-1)` | `.person-edit-form-event`(PersonEditForm) / `.family-event-editor-event`(FamilyEventEditor) | なし(2 箇所は完全一致) |

`.tree-card` を `.surface--raised` の上に載せることで、`PedigreeCanvas` が `FamilyTreeCanvas.css` へ暗黙依存している問題(D3)の解消と同時に、カードの面表現がアプリの他の面と一致することが構造的に保証される。

### A-4. セグメント切替 — `.segmented`

| バリアント | 基本形へ集約する宣言 | 該当セレクタ(ファイル) | 各所に残す差分 |
| --- | --- | --- | --- |
| `.segmented`(横並び) | 外枠: `display: flex` `border: 1px solid var(--line-strong)` `border-radius: var(--radius)` `overflow: hidden`。子ボタン: `font: inherit` `font-size: var(--text-sm)` `padding: var(--space-1) var(--space-3)` `border: none` `background: var(--paper)` `color: var(--ink-soft)` `cursor: pointer`。区切り: `button + button { border-left: 1px solid var(--line-strong) }`。選択: `[aria-pressed='true'] { background: var(--ai-wash); color: var(--ai-strong); font-weight: 600 }` | `.app-view-toggle`(App) / `.person-table-mode`(PersonTableView) | `min-width: 3.5em`(view-toggle) / `margin-right: auto` `margin-left: auto` の配置 |
| `.segmented--stacked`(縦積み) | 外枠は `.surface--overlay` + `flex-direction: column` `overflow: hidden`。子: `border: none` `border-bottom: 1px solid var(--line)` `background: transparent` `color: var(--ink-soft)` `cursor: pointer` + `:last-child { border-bottom: none }`。選択: `[aria-pressed='true'] { background: var(--ai-wash); color: var(--ai-strong); font-weight: 600 }` | `.tree-view-mode-toggle` + `.tree-show-all-toggle`(FamilyTreeCanvas) / `.zoom-controls` + `button`(ZoomControls) | `padding` `font-size` `text-align` `white-space`(表示モード) / `width/height: 36px`・モバイル 44px(ズーム) / `border-radius: 0` |
| `.segmented--buttons`(枠付きボタン群の選択状態) | `[aria-pressed='true'] { border-color: var(--ai); background: var(--ai-wash); color: var(--ai-strong) }` | `.person-panel-action-button` `.person-panel-relation-modes button`(PersonPanel) | なし(2 箇所は完全一致) |

**基本形へ集約しないもの**(選択の意味が異なるため各所に残す):

- `.unconnected-tray-chip[aria-pressed='true']`(UnconnectedTray): 朱(`--shu`)で選択を示す。朱は「選択中の人物」の一意な印であり、藍のセグメント選択とは意味が異なる
- `.sample-gallery-tab[aria-selected='true']`(LandingPage): `role="tab"` の選択で、朱の下線。D10 によりランディングは共通層へ引き上げない

### A-5. 形状トークンの追加

`border-radius: 999px`(ピル形)が **9 箇所**にハードコードされている: `.app-header-status` `.app-save-error button`(App) / `.unconnected-tray-chip` `.unconnected-tray-count`(UnconnectedTray) / `.tree-card-hidden-badge`(FamilyTreeCanvas) / `.empty-state-guide-form button`(EmptyStateGuide) / `.landing-header-app-link` `.landing-cta` `.landing-cta-secondary`(LandingPage)。

`tokens.css` へ `--radius-pill: 999px` を追加し、全箇所をトークン参照へ置き換える(造形の 2 段構成 `--radius` / `--radius-lg` に 3 つ目として加える)。

### A-6. 視覚回帰を防ぐための注意点(実装時に必ず守る)

**注意 1 — `font: inherit` の line-height 副作用**

`font: inherit` はショートハンドのため `line-height` も継承値(`:root` の `1.6`)へ変える。現状、操作要素は 2 群に分かれている。

- **A 群(`font: inherit` あり)**: `line-height` は `1.6`。ボタン 12 箇所・入力 11 箇所
- **B 群(`font: inherit` なし)**: UA の `font` ショートハンドが効いて `line-height: normal`(約 1.2)

基本形に `font: inherit` を置くと B 群のボタンが縦に約 5px 高くなる。B 群のうち `line-height: 1` を明示している 2 箇所(`.settings-menu-trigger` / `.zoom-controls button`)は影響を受けないが、残る 5 箇所には**現行の見た目を保つため `line-height: normal` を明示的に残す**:

`.delete-person-trigger`(DeletePersonControl) / `.data-reset-trigger`(DataResetControl) / `.import-export-trigger`(ImportExportControl) / `.add-person-trigger`(AddPersonControl) / `.tree-show-all-toggle` `.tree-person-search-trigger`(FamilyTreeCanvas)

**注意 2 — `.display-settings-control-field select` は現在システム書体で描かれている**

`index.css` は `button { font-family: var(--font-gothic) }` のみを指定し、`input` / `select` / `textarea` には書体を与えていない。アプリ内の入力欄はすべて `font: inherit` を自前で持つためゴシックで描かれるが、**`.display-settings-control-field select`(DisplaySettingsControl)だけは `font-size` のみの指定で、書体は UA 既定(システム書体)のまま**である。

これは既存の見た目の不統一だが、本変更の完了条件は視覚回帰ゼロであるため、この 1 箇所は `.field` の書体部分を適用せず**現行の見た目を保つ**。統一するかどうかは別 change の判断とする(統一する場合は `.field--sm` を当てるだけで済む)。

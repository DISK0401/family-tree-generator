## Why

Mac Chrome + トラックパッドでの操作時、`PedigreeCanvas`(つながった全体表示)の`wheel`イベントを無条件にズームとして処理しているため、2本指スワイプ(本来はパン)がズームに誤変換され、キャンバスを移動できない。加えて`overscroll-behavior`が未設定のため、パンしようとした2本指スワイプがブラウザの「戻る」ナビゲーションとして誤爆する。ピンチズーム自体は動作するが、固定10%刻み・rAF間引き無しのため速度に見合わない挙動になり「ぎこちない」。

## What Changes

- `PedigreeCanvas.tsx`の`wheel`ハンドラを`ctrlKey`の有無で分岐する(Figma/Excalidraw/Google Maps等と同じ規約)
  - `ctrlKey === true`(トラックパッドのピンチ、または⌘/Ctrl+ホイール)→ ズーム。`deltaY`の大きさに応じた可変ステップにし、既存の`scheduleCamera`(rAF間引き)を通す
  - `ctrlKey === false`(素のホイール回転、トラックパッドの2本指パン)→ パン。`deltaX`/`deltaY`をそのままカメラの平行移動に使い、同じく`scheduleCamera`で間引く
  - **BREAKING(操作仕様の変更)**: 素のマウスホイール(縦回転のみ)の挙動が「ズーム」から「パン」に変わる。ズームは`⌘/Ctrl+ホイール`・ピンチ・`ZoomControls`のボタンで行う
- `html, body`に`overscroll-behavior-x: none`を追加し、wheelの`preventDefault`とは独立にMac Chromeの「2本指スワイプで戻る」誤爆を防ぐ
- 上記のwheel挙動・rAF間引きを検証する単体テスト(`PedigreeCanvas.test.tsx`)を追加する

## Capabilities

### New Capabilities
(なし)

### Modified Capabilities
- `tree-rendering`: 「キャンバス操作」要件の「ズームとパン」シナリオを、`ctrlKey`によるパン/ズーム分岐・トラックパッド2本指パンの明示的サポート・ブラウザの戻るナビゲーション防止を含む内容に更新する

## Impact

- 影響コード: `src/organisms/tree-canvas/PedigreeCanvas.tsx`(wheelハンドラ)、`src/index.css`(`overscroll-behavior-x`)
- 影響範囲: 無料版・有償版の両方(`PedigreeCanvas`はティアに関わらず共通の「つながった全体表示」コンポーネントであり、データ保存方式には手を入れないため両ティアへ同一の修正が適用される)
- プライバシー・法務への影響: なし(UIの入力イベント処理とCSSのみの変更で、通信・データ保存方式の変更を伴わない)
- 競合比較: Figma・Excalidraw・Google Mapsは共通して「素のホイール/2本指スワイプ=パン、Ctrl/⌘+ホイールまたはピンチ=ズーム」という規約を採用している。本changeはこの規約に合わせることで、現状(トラックパッドでパンできない)を修正しつつ、他ツールに慣れた利用者にとって直感的な操作へ改善する
- ロールバック方針: `PedigreeCanvas.tsx`のwheelハンドラと`index.css`の1行追加のみの変更であり、コミット単位でのrevertで即座に旧挙動(素のホイール=ズーム)に戻せる。データモデル・永続化形式への影響が無いため、ロールバックに伴うデータ移行は不要

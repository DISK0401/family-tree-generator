## Context

proposal.md参照(Why/What Changes)。ここでは実装方針を決めるために必要な現状のみ補足する。

- `PedigreeCanvas.tsx`(つながった全体表示)は自前のカメラ状態(`camera: {x,y,width,height}`、Reactの`useState`)を持ち、`viewBox`属性で描画する。`wheel`は`svg`へ直接`{ passive: false }`で登録した独自リスナー。
- `FamilyTreeCanvas.tsx`(折りたたみ表示・全体表示(家系ごと))は`family-chart`(`f3`)に描画を委譲する。`family-chart`は内部で`d3.zoom()`を使い、ズーム状態(transform)をDOM要素の非公開プロパティ`__zoomObj`として保持する。公開API`f3.createChart(cont, data)`はオプション引数を取らないため、ライブラリが用意している`zoom_polite`フィルタ(`wheel`かつ`ctrlKey`無しを無視する設定)にアプリ側から到達する経路が無い。既存の`zoomBy()`(ZoomControlsの+/-ボタン)は`f3.handlers.manualZoom`経由で同じ`__zoomObj`を操作しており、非公開プロパティに依存する前例が既にこのコードベースにある。
- 両キャンバスは`AppShell`(`src/templates/AppShell.tsx`)の`<main className="app-canvas">`配下に排他的に描画される。`.app-canvas`(`AppShell.css`)は既に`overflow: hidden`を持ち、`overscroll-behavior`が効くスクロールコンテナの条件を満たす。ランディングページ(`/`, `TreeFigure.tsx`)は`family-chart`のレンダリング機能のみを静的に使っており、`setupZoom`自体を呼んでいない(zoom/wheelの登録が無い)ため、今回のバグの対象外。

## Goals / Non-Goals

**Goals:**
- 3表示モード(折りたたみ表示・全体表示(家系ごと)・つながった全体表示)で同じ`ctrlKey`規約(素のwheel/2本指パン=パン、Ctrl(⌘)+wheel/ピンチ=ズーム)を実現する
- Mac Chromeの「戻る/進む」誤爆を、エディタ画面(`/app`)に閉じた形で防ぐ
- ピンチ・Ctrl(⌘)+ホイールでのズームを、操作の速さに比例した可変ステップにする

**Non-Goals:**
- `family-chart`側のズーム上限/下限(`scaleExtent`)の変更(既存のまま)
- 実機タッチスクリーン(タブレット等)でのピンチ操作の新規対応。`touch-action: none`は現状維持し、本changeはMacトラックパッドが生成する`wheel`イベント経路のみを対象とする
- ランディングページ(`/`)の挙動変更。`.app-canvas`スコープの対策のため影響しない
- ドラッグによるパン自体のロジック変更(`PedigreeCanvas`の`handlePointerMove`、`family-chart`のドラッグパンは現状のまま)
- `ZoomControls`の+/-ボタンの拡縮率(固定倍率)の変更

## Decisions

### D1: `ctrlKey`によるパン/ズーム分岐(両キャンバス共通)
proposal.mdで決定済み。実装上のポイントは、`PedigreeCanvas`は自前の`wheel`リスナーで完結するのに対し、`FamilyTreeCanvas`は`d3.zoom()`が既に`wheel`を購読しているため、**両者が同一イベントを二重処理しないよう`d3.zoom`側の購読を止める**必要がある(D3で扱う)。

### D2: `PedigreeCanvas`のズームは`deltaY`に比例した可変ステップにし、`scheduleCamera`(既存のrAFスロットル)を通す
- 現状は`e.deltaY > 0 ? 1.1 : 1/1.1`の固定ステップ。これを`deltaY`の大きさに連続的に比例する倍率(指数関数的スケーリング。単発の異常に大きい`deltaY`に備えて1回あたりの変化量はクランプする)に変える。d3-zoomの既定`wheelDelta`計算と同じ考え方(`deltaMode`がPIXEL以外の場合の正規化を含む)を踏襲し、`FamilyTreeCanvas`側(D3、d3-zoom自身のスケーリングをそのまま使う)と体感を合わせる
- ズームも`setCamera`を直接呼ばず`scheduleCamera`を経由させる(現状はパンだけがrAF間引きされており、ズームだけ間引き無しになっている非対称を解消する)
- パンの`deltaX`/`deltaY`の符号は、ドラッグパン(`handlePointerMove`、指の動きと逆方向にカメラを動かす)とは意図的に逆の規約になる。`wheel`の`deltaX`/`deltaY`はブラウザの標準スクロール量なので、カメラ座標へそのまま加算し(OSの「ナチュラルスクロール」設定は`deltaY`の符号として既にブラウザ側で解決済みのため、アプリ側で符号反転は行わない)、一般的なスクロールUIと同じ感覚に合わせる

### D3: `FamilyTreeCanvas`は`__zoomObj`を取得し`.filter()`で`wheel`(`ctrlKey`無し)をd3-zoom自身の処理対象から除外したうえで、自前の`wheel`リスナーで`translateBy`によるパンだけを行う(ズームはd3-zoom自身の既定処理に委ねる)
`el.__zoomObj`(`chart.svg.parentNode`から辿れる、`family-chart`が内部で使う`d3.zoom()`インスタンス)を取得し、`.filter()`(d3-zoomの公開メソッド)を呼んで「`wheel`かつ`ctrlKey`無し」のイベントをd3-zoom自身の既定処理の対象から除外する。`ctrlKey`付きのイベント(ピンチ・⌘/Ctrl+ホイール)はfilterを素通りし、d3-zoom自身の`wheeled`ハンドラ(カーソル位置基準・`deltaY`比例のスケーリングを標準で備える)がそのままズームを処理する(Goals節のとおり、家族側のズームのスケーリング自体には手を入れない)。
除外された(`ctrlKey`無しの)`wheel`イベントは、d3-zoomの購読先と同じ要素(`chart.svg.parentNode`)に追加した自前のリスナー(`{ passive: false }`)で受け、`d3.select(container).call(zoomObj.translateBy, dx, dy)`でパンする。同じtransform状態(`zoomObj`)を経由するため、`family-chart`本体の"zoom"イベントハンドラ(transform反映)・ドラッグパン・`manualZoom`(+/-ボタン)と状態がズレない。

検討した代替案:
- **`zoom_polite`オプションの利用**: 却下。`f3.createChart(cont, data)`にオプション引数が無く、公開APIから到達できない
- **`family-chart`のフォーク/vendor化**: 却下。1点のwheelハンドラ修正のために依存ライブラリ全体を自前管理下に置くのは今回の変更規模に対して過大
- **キャンバスの上に透明なオーバーレイ`div`を重ね、そこで独自にtransformを操作**: 却下。`family-chart`本体のtransform状態(ドラッグパン・+/-ボタン)と二重管理になり、ズレる

`zoomObj.scaleBy`/`translateBy`はd3-zoomの作法上`d3.select(container).call(zoomObj.scaleBy, ...)`のように呼ぶ必要がある。`family-chart`自身は`import * as d3 from 'd3'`という形で`d3`パッケージ(`^7.9.0`)に依存しているが、これは現状`package.json`では`family-chart`経由の間接依存にとどまり、アプリ側の`dependencies`には無い。アプリのコードから`d3.select`を直接使うため、`d3`を`package.json`の`dependencies`へ明示的に追加する(`family-chart`が要求するバージョン`^7.9.0`に合わせる)。間接依存のまま利用すると、将来`family-chart`が`d3`への依存をやめた場合やパッケージマネージャのnode_modules配置が変わった場合に解決できなくなる。

### D4: `overscroll-behavior-x: none`は`.app-canvas`(`AppShell.css`、既に`overflow: hidden`)にスコープする(`html`/`body`全体には設定しない)
ランディングページ(`/`)は`wheel`を奪っておらず、この不具合の対象外。`html`/`body`全体に設定すると、エディタ以外のページでもMac Chromeの2本指スワイプによる「戻る」操作が使えなくなり、不要な副作用になる。`.app-canvas`は両キャンバスの共通の親であり、かつ既に`overflow: hidden`を持つため、`overscroll-behavior`が効くスクロールコンテナの条件を満たす。

## Risks / Trade-offs

- [Risk] `family-chart`の非公開プロパティ`__zoomObj`への依存。将来のバージョン更新でプロパティ名や実装が変わると壊れる → [Mitigation] 取得できない場合は例外を投げず、そのケースでは独自のパン処理を諦めてd3-zoomの既定動作(常時ズーム)に委ねる防御的ガードを入れる。`package.json`は`^0.9.0`(0.9.x内のパッチ更新のみ許容)であることを確認済みで、影響範囲は限定的
- [Risk] 素のホイール=パンへの変更はBREAKING。既存操作に慣れた利用者の体験を変える → [Mitigation] `ZoomControls`の+/-ボタン、Ctrl(⌘)+ホイール、ピンチによるズームは変わらず使える。挙動変更の告知は本changeのスコープ外
- [Risk] `deltaMode`が`PIXEL`以外(古いマウス等)だとパン/ズーム量が体感と合わないことがある → [Mitigation] d3-zoomの既定`wheelDelta`と同様の`deltaMode`別スケーリングを両キャンバスのパン/ズーム計算で揃えて適用する
- [Risk] `.app-canvas`スコープの`overscroll-behavior-x: none`だけでは、慣性(モメンタム)スクロール中にブラウザが`wheel`イベントをpassive化し、JS側の`preventDefault`が効かなくなるフェーズでの「戻る」誤爆を防ぎきれない可能性がある(Playwrightのsynthetic wheelイベントではこのフェーズ差・実際のOSジェスチャ認識を再現できないため、自動テストでは検出できない) → [Mitigation] 下記Open Questionsを参照

## Migration Plan

データ移行は無い(UIの入力イベント処理とCSSのみの変更)。通常のPRマージ(`develop`)フローで反映する。ロールバックはproposal.md記載のとおり、対象ファイルのcommit revertで即時可能。

**archiveのタイミング(ユーザー確認済み)**: `npm run test:e2e`のローカル全件パス後、ユーザー自身が手元のMac Chrome + 実機トラックパッドで動作確認を行い、その結果を受けてarchiveの指示を出す。dev/本番環境へのデプロイは前提としない(ユーザーのローカル環境での確認)。ローカルのunit/e2eテストが通っただけでは自動的にarchiveしない。

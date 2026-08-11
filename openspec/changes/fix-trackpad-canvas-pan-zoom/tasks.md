## 1. 依存関係の整備

- [ ] 1.1 `d3`を`package.json`の`dependencies`へ明示的に追加する(`family-chart`が要求する`^7.9.0`に合わせる。完了条件: `npm ls d3`でトップレベル依存として解決される)

## 2. PedigreeCanvas(つながった全体表示)のwheel分岐

- [ ] 2.1 既存の`wheel`ハンドラを`ctrlKey`で分岐させ、`ctrlKey === false`のときは`deltaX`/`deltaY`をカメラ座標へ加算するパン処理にする(`deltaMode`がPIXEL以外の場合の正規化を含む。完了条件: `ctrlKey`無しのwheelでカメラの`x`/`y`が変化し、`width`/`height`は変化しない単体テストが通る)
- [ ] 2.2 `ctrlKey === true`のときのズームを、`deltaY`の大きさに連続的に比例する可変ステップ(1回あたりの変化量はクランプ)に変更する(完了条件: 小さい`deltaY`と大きい`deltaY`とで拡大率が異なる単体テストが通る)
- [ ] 2.3 ズームの`setCamera`呼び出しを`scheduleCamera`(既存のrAFスロットル)経由に統一する(完了条件: 連続したwheelイベントでも1フレームあたり1回しか`setCamera`が呼ばれないことをテストで確認する)
- [ ] 2.4 `PedigreeCanvas.test.tsx`にwheel関連のテストを追加する(`ctrlKey`有無でのパン/ズームの切り分け、ズームがカーソル位置基準になること、既存のドラッグパン・`ZoomControls`ボタンの挙動が変わらないこと)

## 3. FamilyTreeCanvas(折りたたみ表示・全体表示(家系ごと))のwheel分岐

- [ ] 3.1 `chart`生成後に`__zoomObj`(`chart.svg`または`chart.svg.parentNode`が持つ)を取得するヘルパーを実装する。取得できない場合は例外を投げず、以降の独自処理をスキップして`family-chart`の既定動作に委ねる防御的ガードを入れる(完了条件: `__zoomObj`が無いダミー要素でもエラーにならない単体テストが通る)
- [ ] 3.2 取得した`zoomObj`に`.filter()`を設定し、「`wheel`かつ`ctrlKey`無し」のイベントをd3-zoom自身の処理対象から除外する(完了条件: 除外後もドラッグパン・ピンチ(`ctrlKey`あり)は`filter`を通ることを単体テストで確認する)
- [ ] 3.3 自前の`wheel`リスナー(`{ passive: false }`)を追加し、`ctrlKey`の有無で`zoomObj.scaleBy`(ズーム、カーソル位置基準)/`zoomObj.translateBy`(パン)を`d3.select(container).call(...)`経由で呼び分ける。ステップ量・`deltaMode`正規化は2群のPedigreeCanvas側と揃える(完了条件: `ctrlKey`無しのwheelで`family-chart`のtransform(`.view`の`transform`属性)が平行移動することを単体テストで確認する)
- [ ] 3.4 `ZoomControls`の+/-ボタン(`f3.handlers.manualZoom`)とドラッグパンが本changeの前後で挙動を変えないことを確認する回帰テストを追加・更新する
- [ ] 3.5 `FamilyTreeCanvas.test.tsx`にwheel関連のテストを追加する(3.1〜3.3の完了条件をまとめて検証するテストケースとして整理する)

## 4. ブラウザの戻る操作の防止

- [ ] 4.1 `AppShell.css`の`.app-canvas`に`overscroll-behavior-x: none`を追加する(完了条件: ランディングページ(`/`)側のCSSは変更されないことをdiffで確認する)

## 5. 品質チェック

- [ ] 5.1 `npm run lint` / `npm run format:check` / `npm run typecheck`をすべてパスさせる
- [ ] 5.2 `npm run test`(全件)をパスさせる
- [ ] 5.3 `npm run test:e2e`(全件、`e2e/no-external-requests.spec.ts`を含む外部送信ゼロ検証)をパスさせる

## 6. ドキュメント

- [ ] 6.1 README.mdに現状ズーム/パンの操作方法の説明が無いことを確認し、追記が必要かどうかを判断する(完了条件: 追記する場合は該当箇所を更新、不要と判断した場合はその旨をPR説明に記す)

## 7. 実機確認とarchive

- [ ] 7.1 ユーザーが手元のMac Chromeで、3表示モード(折りたたみ表示・全体表示(家系ごと)・つながった全体表示)それぞれについて、2本指パン・Ctrl(⌘)+ホイール/ピンチによるズーム・ブラウザの「戻る」誤爆の有無を確認する(design.md「archiveのタイミング」参照)
- [ ] 7.2 7.1の結果を踏まえたユーザーのarchive指示を受けてから、このchangeをarchiveする

## 1. 間隔定数の一元化(design.md D1)

- [x] 1.1 `src/layout/coordinates.ts` の `VERTICAL_GAP`/`HORIZONTAL_GAP` が外部からimport可能な状態(`export const`)であることを確認する。完了条件: `FamilyTreeCanvas.tsx` から両定数をimportできる — 既にexport済みであることを確認
- [x] 1.2 `FamilyTreeCanvas.tsx` の `FAMILY_CHART_ROW_MARGIN`/`FAMILY_CHART_COLUMN_MARGIN` を削除し、`setCardYSpacing`/`setCardXSpacing` を `CARD_HEIGHT + VERTICAL_GAP`/`CARD_WIDTH + HORIZONTAL_GAP` から算出するよう書き換える。完了条件: `FamilyTreeCanvas.tsx` に独自のマージン定数が残っていない
- [x] 1.3 開発サーバでPlaywrightにより、折りたたみ表示・全体表示(家系ごと)・つながった全体表示それぞれの3世代以上の家系図をスクリーンショットし、世代間・同一世代内の余白が3表示で揃って見えることを確認する。完了条件: 3表示のスクリーンショットを見比べ、縦横いずれの余白も大きな差がない — 3世代(祖父母・親・孫)構成でPlaywrightスクリーンショットを取得。`aria-pressed`で実際にモードが切り替わったことを確認したうえで比較し、世代間の縦の余白・同一世代内の横の余白とも3表示で近い見え方になっていることを確認

## 2. 婚姻日ラベルの視認性確保(design.md D1・D2)

- [x] 2.1 表示設定「婚姻日(線)」オン・和暦表示で、婚姻日の月日部分が長くなる組み合わせ(例: 十月・十二月かつ二桁の日)を含む配偶者データをPlaywrightで実際にレンダリングし、婚姻日ラベルの描画幅(px)を実測する。完了条件: 実測値がログまたはコメントとして記録される — 和暦フル精度の最長パターン「昭和63年12月25日」(11文字)で実測69.47px。`coordinates.ts`のコメントに記録済み
- [x] 2.2 実測値(2.1)と現行の `HORIZONTAL_GAP`(24px)を比較し、大きい方を新しい `HORIZONTAL_GAP` として `coordinates.ts` に反映する。1.2で参照した値が変わるため、必要なら折りたたみ表示側の見た目を再確認する。完了条件: `HORIZONTAL_GAP` が婚姻日ラベルの実測幅以上になっている — フォントレンダリング差の余裕を見て80pxに設定(69.47pxに対し約10.5pxの余裕)
- [x] 2.3 折りたたみ表示・全体表示(家系ごと)の双方、和暦・西暦それぞれの表示形式で、婚姻日ラベルを含む家系図をPlaywrightでスクリーンショットし、ラベルの全文字が両側の人物カードに隠れず判読できることを確認する。完了条件: 4通り(表示×形式)いずれのスクリーンショットでもラベルがカードに隠れていない — 4通りすべてでスクリーンショット取得・目視確認。加えてラベルと全カードの`getBoundingClientRect()`同士が幾何学的に重ならないことをテストコードでも検証(重なりなし)

## 3. カード選択時の表示崩れ修正(design.md D3)

- [x] 3.1 `src/organisms/tree-canvas/person-card.css` の `.tree-card.selected` を、`border-width` 拡大+padding縮小の実装から `outline`(+`outline-offset`)ベースの実装へ書き換える。`.tree-card` 本体の `border-width`/`padding` は変更しない。完了条件: `.tree-card.selected` のルールに `padding` の上書きが含まれない
- [x] 3.2 選択状態のスタイルに依存する既存テスト(`person-card.test.ts`、`card-consistency.test.tsx` 等)を確認し、`outline` ベースの実装に合わせて必要なら更新する。完了条件: 該当テストが `npx vitest run` で通過する — 既存テストはHTMLのclass属性(`selected`)を検証するのみでCSSの実装方式に依存しないため、変更なしで通過を確認(person-card.test.ts, card-consistency.test.tsx, primitives.test.ts 計50件)
- [x] 3.3 開発サーバで、性別インジケーター・故人マーカーの両方が表示されている人物カードを選択した状態をPlaywrightでスクリーンショットし(ライト/ダーク両テーマ)、氏名列・アイコンが選択前と同じ位置のまま崩れていないことを確認する。完了条件: 選択前後で氏名列・アイコンの位置が変わらず、互いに重ならない — カード自身を基準にした相対位置がほぼ変わらない(1px以内)ことをテストで検証し、ライト/ダーク両テーマのスクリーンショットでも氏名列・アイコンが重ならず判読できることを確認

## 4. 既存テスト・回帰確認

- [x] 4.1 `npx vitest run src/layout/coordinates.test.ts` を実行し、間隔定数の変更に伴う期待値のずれがあれば修正する。完了条件: `coordinates.test.ts` が通過する — 「層をまたぐ縦線は、中間層のカードを避けて隣の隙間へスナップされる」が、`HORIZONTAL_GAP`拡大(24→80)により「結合点がmidのカードの真上」という前提を満たさなくなり失敗。`mid`にもう1人子を追加してsubtreeの重みを調整し、前提が新しい間隔でも成立するようフィクスチャを修正(レイアウトアルゴリズム自体は変更していない)。19件全て通過
- [x] 4.2 `npm run test` を実行し、全テストに回帰がないことを確認する。完了条件: 全テストが通過する — 74ファイル967件全て通過
- [x] 4.3 `npm run lint` / `npm run format:check` / `npm run typecheck` を実行する。完了条件: いずれもエラーなしで完了する — いずれもエラーなし(`FamilyTreeCanvas.tsx`のimport整形をprettierで自動修正)
- [x] 4.4 `npm run test:e2e` を実行する(archiveゲート)。完了条件: Playwrightスモークが全件パスする — 5件全て通過(このサンドボックス環境ではプリインストール済みブラウザのリビジョン差異のためexecutablePath指定が実行時に必要だったが、`playwright.config.ts`は変更していない。CI/実際の開発環境では発生しないセッション固有の環境差異)

## 5. specsとの整合・仕上げ

- [x] 5.1 `openspec/changes/fix-marriage-label-spacing-selection/specs/tree-rendering/spec.md` の追加・変更した各シナリオ(婚姻線ラベルの視認性、表示モード間のカード間隔の一貫性、選択してもカード内部の表示が崩れない)を実機で再確認する。完了条件: 3件のシナリオすべてを満たしていることをスクリーンショットまたは目視で確認済み — 1〜3群の実装時にPlaywrightで実機確認済み(婚姻線ラベル: 和暦/西暦×折りたたみ/全体表示(家系ごと)の4通りで非重なりを幾何学的に検証、カード間隔: 3世代構成で3表示モードを`aria-pressed`確認のうえスクリーンショット比較、選択時: 相対位置の不変(1px以内)をアサーションで検証しライト/ダーク両テーマでスクリーンショット確認)
- [x] 5.2 README.mdに今回の修正に関連する記述(婚姻日表示・カード間隔・選択時の見た目)がある場合は更新する。該当する記述がなければ対応不要と明記して完了とする — 「婚姻日(線)」「折りたたみ表示/全体表示(家系ごと)/つながった全体表示」等の機能説明はあるが、具体的な間隔px値や選択時のCSS実装方式には触れていないため、今回の修正で記述内容に齟齬は生じない。対応不要

## 1. 間隔定数の一元化(design.md D1)

- [ ] 1.1 `src/layout/coordinates.ts` の `VERTICAL_GAP`/`HORIZONTAL_GAP` が外部からimport可能な状態(`export const`)であることを確認する。完了条件: `FamilyTreeCanvas.tsx` から両定数をimportできる
- [ ] 1.2 `FamilyTreeCanvas.tsx` の `FAMILY_CHART_ROW_MARGIN`/`FAMILY_CHART_COLUMN_MARGIN` を削除し、`setCardYSpacing`/`setCardXSpacing` を `CARD_HEIGHT + VERTICAL_GAP`/`CARD_WIDTH + HORIZONTAL_GAP` から算出するよう書き換える。完了条件: `FamilyTreeCanvas.tsx` に独自のマージン定数が残っていない
- [ ] 1.3 開発サーバでPlaywrightにより、折りたたみ表示・全体表示(家系ごと)・つながった全体表示それぞれの3世代以上の家系図をスクリーンショットし、世代間・同一世代内の余白が3表示で揃って見えることを確認する。完了条件: 3表示のスクリーンショットを見比べ、縦横いずれの余白も大きな差がない

## 2. 婚姻日ラベルの視認性確保(design.md D1・D2)

- [ ] 2.1 表示設定「婚姻日(線)」オン・和暦表示で、婚姻日の月日部分が長くなる組み合わせ(例: 十月・十二月かつ二桁の日)を含む配偶者データをPlaywrightで実際にレンダリングし、婚姻日ラベルの描画幅(px)を実測する。完了条件: 実測値がログまたはコメントとして記録される
- [ ] 2.2 実測値(2.1)と現行の `HORIZONTAL_GAP`(24px)を比較し、大きい方を新しい `HORIZONTAL_GAP` として `coordinates.ts` に反映する。1.2で参照した値が変わるため、必要なら折りたたみ表示側の見た目を再確認する。完了条件: `HORIZONTAL_GAP` が婚姻日ラベルの実測幅以上になっている
- [ ] 2.3 折りたたみ表示・全体表示(家系ごと)の双方、和暦・西暦それぞれの表示形式で、婚姻日ラベルを含む家系図をPlaywrightでスクリーンショットし、ラベルの全文字が両側の人物カードに隠れず判読できることを確認する。完了条件: 4通り(表示×形式)いずれのスクリーンショットでもラベルがカードに隠れていない

## 3. カード選択時の表示崩れ修正(design.md D3)

- [ ] 3.1 `src/organisms/tree-canvas/person-card.css` の `.tree-card.selected` を、`border-width` 拡大+padding縮小の実装から `outline`(+`outline-offset`)ベースの実装へ書き換える。`.tree-card` 本体の `border-width`/`padding` は変更しない。完了条件: `.tree-card.selected` のルールに `padding` の上書きが含まれない
- [ ] 3.2 選択状態のスタイルに依存する既存テスト(`person-card.test.ts`、`card-consistency.test.tsx` 等)を確認し、`outline` ベースの実装に合わせて必要なら更新する。完了条件: 該当テストが `npx vitest run` で通過する
- [ ] 3.3 開発サーバで、性別インジケーター・故人マーカーの両方が表示されている人物カードを選択した状態をPlaywrightでスクリーンショットし(ライト/ダーク両テーマ)、氏名列・アイコンが選択前と同じ位置のまま崩れていないことを確認する。完了条件: 選択前後で氏名列・アイコンの位置が変わらず、互いに重ならない

## 4. 既存テスト・回帰確認

- [ ] 4.1 `npx vitest run src/layout/coordinates.test.ts` を実行し、間隔定数の変更に伴う期待値のずれがあれば修正する。完了条件: `coordinates.test.ts` が通過する
- [ ] 4.2 `npm run test` を実行し、全テストに回帰がないことを確認する。完了条件: 全テストが通過する
- [ ] 4.3 `npm run lint` / `npm run format:check` / `npm run typecheck` を実行する。完了条件: いずれもエラーなしで完了する
- [ ] 4.4 `npm run test:e2e` を実行する(archiveゲート)。完了条件: Playwrightスモークが全件パスする

## 5. specsとの整合・仕上げ

- [ ] 5.1 `openspec/changes/fix-marriage-label-spacing-selection/specs/tree-rendering/spec.md` の追加・変更した各シナリオ(婚姻線ラベルの視認性、表示モード間のカード間隔の一貫性、選択してもカード内部の表示が崩れない)を実機で再確認する。完了条件: 3件のシナリオすべてを満たしていることをスクリーンショットまたは目視で確認済み
- [ ] 5.2 README.mdに今回の修正に関連する記述(婚姻日表示・カード間隔・選択時の見た目)がある場合は更新する。該当する記述がなければ対応不要と明記して完了とする

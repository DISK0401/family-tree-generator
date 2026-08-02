## 1. 実装

- [x] 1.1 `src/organisms/tree-canvas/FamilyTreeCanvas.tsx` に `FAMILY_CHART_ROW_MARGIN`(22)・`FAMILY_CHART_COLUMN_MARGIN`(44)定数を追加し、`setCardYSpacing`/`setCardXSpacing` の引数を `CARD_HEIGHT + FAMILY_CHART_ROW_MARGIN` / `CARD_WIDTH + FAMILY_CHART_COLUMN_MARGIN` に置き換える(design.md D1)。完了条件: `setCardYSpacing(202)` 相当・`setCardXSpacing(180)` 相当になっており、マジックナンバーがハードコードされていない

## 2. 検証

- [x] 2.1 `npm run dev` で `/app` を開き、3世代以上・傍系のいる家系図(既存サンプルデータで可)を折りたたみ表示・全体表示(家系ごと)で表示し、隣接世代のカードが重ならないことを目視確認する。完了条件: いずれのモードでもカードの上下端が他カードへ食い込んでいない
- [x] 2.2 同じデータをつながった全体表示で表示し、今回の変更による見た目の変化がないことを確認する(この変更は `pedigree-layout` 側に触れていないため回帰していないはず)
- [x] 2.3 折りたたみ表示・全体表示(家系ごと)それぞれのスクリーンショットを撮り、修正前後で世代間の余白が破綻していないか(間隔が広すぎて間延びして見えないか)を確認する
- [x] 2.4 `npm run test` を実行し、`FamilyTreeCanvas.update-behavior.test.tsx` を含む既存テストがすべてパスすることを確認する
- [x] 2.5 `npm run test:e2e` を実行し、既存のPlaywrightスモークが全件パスすることを確認する(CLAUDE.mdのarchiveゲート)
- [x] 2.6 `npm run lint` / `npm run typecheck` / `npm run format:check` を実行し、品質チェックを通す

## 3. 仕上げ

- [x] 3.1 `openspec validate fix-family-chart-card-spacing --type change --strict` を実行し、proposal/specs/design/tasksの整合性を確認する

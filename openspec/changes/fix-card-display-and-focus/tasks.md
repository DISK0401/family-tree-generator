## 1. カード縦書き氏名の折り返し・はみ出し修正

- [ ] 1.1 `.tree-card-surname`/`.tree-card-given`(`src/rendering/FamilyTreeCanvas.css`)に `white-space: nowrap` を追加し、縦書きテキストが追加の列へ折り返されないようにする。完了条件: 4文字以上の姓・名を持つカードでも列が1本のまま増えない
- [ ] 1.2 `src/rendering/person-card.ts` に、姓・名それぞれの文字数から縮小率(下限つき)を導出する純粋関数を追加し、`derivePersonCardView`/`personCardInnerHtml` から名前列のインラインフォントサイズへ反映する。完了条件: 5文字程度の氏名でもカードの固定高さ内に収まる
- [ ] 1.3 1.1・1.2 の変更を折りたたみ表示(family-chart)・全体表示・つながった全体表示(PedigreeCanvas)の3表示すべてで目視確認する。完了条件: 3表示のいずれでも文字順の崩れ・枠からのはみ出しがない
- [ ] 1.4 `src/rendering/card-consistency.test.tsx` に、長い氏名(例:「富岡」「大裕」「愛梨奈」相当)を含むケースの回帰テストを追加する

## 2. 関係追加後の自動フォーカス

- [ ] 2.1 `PersonPanel`(`src/components/PersonPanel.tsx`)に `onPersonCreated?: (personId: PersonId) => void` プロパティを追加する
- [ ] 2.2 `handleSubmit` 内で `addSpouse`/`addChild`/`addParent` の戻り値から新規人物ID(`spouseId`/`childId`/`parentId`)を取り出し、`onPersonCreated` を呼び出すようにする
- [ ] 2.3 `App.tsx` で `PersonPanel` に `onPersonCreated={requestSelectionChange}` を渡し、既存の未確定変更の確認ダイアログ経路にそのまま乗せる
- [ ] 2.4 `src/components/PersonPanel.test.tsx` に、配偶者・子・親それぞれの追加後に選択IDが新規人物へ切り替わることを検証するテストを追加する

## 3. 検証・仕上げ

- [ ] 3.1 `npm run test`(または該当するテストコマンド)を実行し、既存テストを含め全て通ることを確認する
- [ ] 3.2 開発サーバー上でブラウザ操作により、3点(氏名崩れ・折りたたみ表示の改行・新規人物への自動フォーカス)がいずれも解消されていることを確認する

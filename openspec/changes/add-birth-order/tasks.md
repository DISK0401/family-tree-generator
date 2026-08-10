## 1. ドメインモデル

- [x] 1.1 `src/domain/types.ts`の`Person`に`birthOrder?: number`を追加し、`SCHEMA_VERSION`を2へ上げる。完了条件: 型定義とバージョン定数の変更のみで既存の`domain/commands.test.ts`が通る
- [x] 1.2 `src/persistence/db.ts`の`MIGRATIONS[1]`に、データを変更せず`schemaVersion`を2へ進めるだけのステップを追加する。完了条件: `schemaVersion: 1`の保存データを読み込むと`status: 'migrated'`で`schemaVersion: 2`になるテストが通る
- [x] 1.3 `domain/commands.test.ts`に、`updatePerson`で`birthOrder`を設定・解除できることを確認するテストを追加する。完了条件: 追加テストが通る(既存コマンドの実装変更は不要なはず)

## 2. 兄弟の並び順比較・出生順位ラベル導出(共有ロジック)

- [x] 2.1 `src/domain/sibling-order.ts`を新設し、`{ birthOrder?: number; birthYear?: number; displayName: string }`を受け取る`compareSiblingOrder`を実装する(優先順位: 出生順→出生順の有無→生年→氏名)。完了条件: 単体テストで「出生順同士」「片方のみ出生順あり」「出生順なしの生年判明/不明」の全パターンを検証
- [x] 2.2 同ファイルに、家族内の子リスト(各人の`birthOrder`・`gender`)から出生順位ラベル(長男/次男/長女/次女等)を導出する`deriveBirthOrderLabel`を実装する。性別「不明」の子は男女どちらの通し番号にも数えない。完了条件: 性別不明の兄弟を挟むケース・出生順未設定者にはラベルを出さないケースを含む単体テスト

## 3. つながった全体表示(pedigree-layout)への反映

- [x] 3.1 `src/layout/graph.ts`の`PersonNode`に`birthOrder`・`birthYear`・`displayName`を追加し、`buildGraph(doc)`が`doc.persons`から値を派生させる。完了条件: `graph.test.ts`(または相当するテスト)でノードにこれらの値が反映されることを確認
- [x] 3.2 `src/layout/ordering.ts`の`findParentRank`内の`siblingRank`計算を、`family.children`の登録順インデックスから、`compareSiblingOrder`で並べ替えた順位に置き換える。完了条件: `layout/ordering.test.ts`に出生順ベースの並び替えテストを追加し通過する
- [x] 3.3 出生順が生年より優先されること(出生順ありの子が、出生順なし・生年判明の子より前に来る)を検証するテストを`layout/ordering.test.ts`に追加する

## 4. 折りたたみ表示・全体表示(家系ごと)(to-family-chart-data)への反映

- [x] 4.1 `to-family-chart-data.ts`の`FamilyChartDatum.data`に`birthOrder`を追加し、`compareChildrenByBirthThenName`の内部実装を`compareSiblingOrder`呼び出しに置き換える(関数名・エクスポートは維持)。完了条件: `to-family-chart-data.test.ts`の既存テストに加え、出生順優先のケースが通る
- [x] 4.2 出生順が設定された子と設定されていない子が混在する場合の並び順テストを追加する

## 5. 出生順位ラベルのカード表示

- [x] 5.1 `person-card.ts`の`PersonCardInput`/`PersonCardView`に`birthOrderLabel?: string`を追加する
- [x] 5.2 `derivePersonCardView`で表示設定に応じた表示判定を行い、`personCardInnerHtml`(または該当関数)で`escapeHtml`/`htmlTag`経由でHTMLへ組み込む。配置は性別インジケーター→故人マーカー(†)→出生順位ラベルの順。完了条件: `person-card.test.ts`にラベルあり/なし・故人マーカーとの同時表示のスナップショット相当テストを追加
- [x] 5.3 `person-card.css`に出生順位ラベルのスタイル(故人マーカーの右に隣接、重ならない位置)を追加する

## 6. 描画アダプタでのラベル算出・受け渡し

- [x] 6.1 `to-family-chart-data.ts`で、`findPrimaryParentFamily`を使って人物の兄弟グループを解決し、`deriveBirthOrderLabel`の結果を`personToCardInput`経由で`PersonCardInput.birthOrderLabel`へ渡す
- [x] 6.2 `PedigreeCanvas.tsx`(またはそのカードデータ準備処理)でも同じ`deriveBirthOrderLabel`を使い、ラベル算出ロジックが2つの描画系で重複しないようにする
- [x] 6.3 `card-consistency.test.tsx`に、出生順位ラベルが折りたたみ表示とつながった全体表示で一致することを確認するテストを追加する

## 7. 編集UI(PersonEditForm)

- [x] 7.1 `PersonEditForm.tsx`に出生順の数値入力欄を追加する(空欄=未設定を許容、性別selectの近傍に配置)
- [x] 7.2 `PersonEditForm.test.tsx`に、出生順の入力・未入力・確定後の反映を確認するテストを追加する

## 8. GEDCOM入出力

- [x] 8.1 `docs/gedcom-mapping.md`の`Person → INDI`表に`birthOrder`→拡張タグ`_BIRTH_ORDER`の対応を追記する
- [x] 8.2 `src/lib/gedcom/export.ts`でGEDCOM 7.0/5.5.1互換モード双方に`_BIRTH_ORDER`を出力し、7.0の`HEAD`の`SCHMA`に宣言を追加する。完了条件: `export.test.ts`に出生順ありの人物のエクスポートテストを追加
- [x] 8.3 `src/lib/gedcom/import.ts`で`_BIRTH_ORDER`を読み取り`Person.birthOrder`へ変換する。数値としてパースできない値は警告を出して無視する。完了条件: `import.test.ts`に往復(エクスポート→インポート)テストを追加
- [x] 8.4 `src/lib/gedcom/importExportRoundtrip.test.ts`に出生順を含むケースを追加し、7.0/5.5.1双方で往復して値が保持されることを確認する(`roundtrip.test.ts`はGEDCOM構文層のみを扱うテストのため対象外と判断)

## 9. 仕上げ

- [x] 9.1 `README.md`に出生順位機能の記載を追加する(該当セクションがあれば更新)
- [x] 9.2 `npm run lint` / `npm run format:check` / `npm run typecheck` が通ることを確認する
- [x] 9.3 `npm run test` (全件)が通ることを確認する
- [x] 9.4 `npm run dev`でアプリを起動し、出生順の入力→カード表示(出生順位ラベル・配置)→兄弟の並び順(折りたたみ表示・全体表示(家系ごと)・つながった全体表示)を実画面で確認する。特に「性別不明の兄弟を挟むケース」「片方だけ出生順が設定されているケース」をスクリーンショットで確認する。**この確認により、つながった全体表示だけ兄弟の並びが人物ID順に落ちる重大なバグを発見し、`layout/ordering.ts`のsweepOnceタイブレークを修正した**
- [x] 9.5 `npm run test:e2e` が通ることを確認する(archiveのゲート要件)。既定のPlaywright設定ではセッション環境のプリインストール済みChromiumバージョンと不一致で起動できなかったため、`executablePath`を上書きしたローカル専用設定(非コミット)で実行し、5件すべて通過を確認した

## 1. ドメイン層: 家族イベント編集コマンド

- [ ] 1.1 `src/domain/commands.ts` に `setFamilyEvent(doc, familyId, type, event | undefined)` を追加する(design.md D3)。完了条件: 指定種別(marriage/divorce)の最初の1件を置換・新規追加・削除(`undefined`指定時)できる
- [ ] 1.2 `commands.test.ts` に `setFamilyEvent` のテストを追加する。完了条件: 3件以上のイベント(復縁)を持つFamilyに対して呼び出しても、対象外のイベントがそのまま保持されることを確認するテストを含む

## 2. UI: 家族イベント編集パネル

- [ ] 2.1 `FamilyEventEditor` コンポーネントを新規作成する(design.md D1/D2)。選択中人物が配偶者として属する各Familyについて、婚姻日・離婚日(+場所)を `WarekiDateInput` で編集できるようにし、変更は即時反映(確定ボタンなし)とする
- [ ] 2.2 3件以上のイベントを持つFamilyに対する注記表示を実装する(design.md Non-Goal)。完了条件: 復縁データを持つFamilyを選択した際に「他に◯件のイベントがあります」旨の注記が表示され、保存操作をしても対象外イベントが失われない
- [ ] 2.3 `PersonPanel.tsx` に `FamilyEventEditor` を組み込む(`PedigreeEditor` の直後に配置)
- [ ] 2.4 `FamilyEventEditor.test.tsx` を追加する。完了条件: 婚姻日の設定・削除、複数家族(再婚等)の独立編集が spec `tree-editor` のシナリオどおりに動作することを確認する

## 3. 表示設定: 和暦表示モード

- [ ] 3.1 `src/settings/display-settings.ts` に `calendarMode: 'gregorian' | 'wareki'`(デフォルト `'gregorian'`)を追加する(design.md D4)。既存の防御的パースにフォールバックを追加する
- [ ] 3.2 `formatDateForDisplay` を拡張し、「実データ精度→表示粒度→和暦変換」の順で処理する(design.md D4)。`gregorianToWareki` が `null` を返す場合(明治より前)は西暦表示にフォールバックする(design.md D5)
- [ ] 3.3 `display-settings-store.ts` に `calendarMode` の状態と `setCalendarMode` を追加する
- [ ] 3.4 `DisplaySettingsControl.tsx` に表示形式(西暦/和暦)のセレクトを追加する(design.md D7)
- [ ] 3.5 `display-settings.test.ts` / `display-settings-store.test.ts` にテストを追加する。完了条件: 和暦変換、粒度設定との組み合わせ、明治より前の日付のフォールバックの各ケースを確認する

## 4. 表示設定: カード表示項目の選択

- [ ] 4.1 `display-settings.ts` に `visibleCardFields`(`surname`/`given`/`furigana`/`birthDate`/`deathDate`/`birthPlace`/`deathPlace`/`age`/`genderIcon` の各boolean)を追加する(design.md D8)。デフォルトは現状のカード表示と完全一致させ、既存設定と同様キー単位のフォールバックを持たせる
- [ ] 4.2 `display-settings-store.ts` に `visibleCardFields` の状態とsetterを追加する
- [ ] 4.3 `DisplaySettingsControl.tsx` にカード表示項目のチェックボックス群を追加する。姓・名を両方非表示にした場合の影響を説明文で明示する(design.md リスク対応)
- [ ] 4.4 テストを追加する。完了条件: 項目ごとのオン/オフ切り替え、デフォルト値、姓・名を両方非表示にした場合にフォールバック文言が表示されないことを確認する

## 5. 描画: カードデータ・キャンバス反映

- [ ] 5.1 `src/rendering/to-family-chart-data.ts` の `FamilyChartCardData` に `surnameKana`/`givenKana`/`birthPlace`/`deathPlace` を追加し、`buildPersonDatums` で値を設定する
- [ ] 5.2 `FamilyTreeCanvas.tsx` のカードHTML生成を `visibleCardFields`・`calendarMode` に応じて分岐させる(design.md D6/D8)。姓・名の表示ロジックを「表示対象かつデータが存在する」基準に再構成する
- [ ] 5.3 `to-family-chart-data.test.ts` および `FamilyTreeCanvas` 関連テストを更新する。完了条件: 新フィールドがカードデータへ反映されること、表示設定フラグに応じて出し分けられることを確認する

## 6. 確認・ドキュメント

- [ ] 6.1 `npm run lint` / `npm run typecheck` / `npm run test` をすべて実行し、通過することを確認する
- [ ] 6.2 開発サーバーで動作確認する。完了条件: 婚姻・離婚日の編集、和暦表示モードの切り替え、カード表示項目のトグル(姓を非表示にして名だけ表示する等)を実際にブラウザで確認する
- [ ] 6.3 `README.md` を更新する。完了条件: 「表示設定」の説明に和暦表示モード・カード表示項目の選択を追記し、「人物情報の編集」周辺の説明に婚姻・離婚イベント編集を追記する
- [ ] 6.4 `docs/gedcom-mapping.md` を確認する。完了条件: 今回の変更が既存のMARR/DIV対応記述の範囲内(新規GEDCOMタグの追加なし)であることを確認し、更新が不要であることを確かめる

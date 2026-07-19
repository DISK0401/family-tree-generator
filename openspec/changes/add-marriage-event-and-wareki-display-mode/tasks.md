## 1. ドメイン層: 家族イベント編集コマンド

- [x] 1.1 `src/domain/commands.ts` に `setFamilyEvent(doc, familyId, type, event | undefined)` を追加する(design.md D3)。完了条件: 指定種別(marriage/divorce)の最初の1件を置換・新規追加・削除(`undefined`指定時)できる
- [x] 1.2 `commands.test.ts` に `setFamilyEvent` のテストを追加する。完了条件: 3件以上のイベント(復縁)を持つFamilyに対して呼び出しても、対象外のイベントがそのまま保持されることを確認するテストを含む

## 2. UI: 家族イベント編集パネル

- [x] 2.1 `FamilyEventEditor` コンポーネントを新規作成する(design.md D1/D2)。選択中人物が配偶者として属する各Familyについて、婚姻日・離婚日(+場所)を `WarekiDateInput` で編集できるようにし、変更は即時反映(確定ボタンなし)とする
- [x] 2.2 3件以上のイベントを持つFamilyに対する注記表示を実装する(design.md Non-Goal)。完了条件: 復縁データを持つFamilyを選択した際に「他に◯件のイベントがあります」旨の注記が表示され、保存操作をしても対象外イベントが失われない
- [x] 2.3 `PersonPanel.tsx` に `FamilyEventEditor` を組み込む(`PedigreeEditor` の直後に配置)
- [x] 2.4 `FamilyEventEditor.test.tsx` を追加する。完了条件: 婚姻日の設定・削除、複数家族(再婚等)の独立編集が spec `tree-editor` のシナリオどおりに動作することを確認する

## 3. 表示設定: 和暦表示モード

- [x] 3.1 `src/settings/display-settings.ts` に `calendarMode: 'gregorian' | 'wareki'`(デフォルト `'gregorian'`)を追加する(design.md D4)。既存の防御的パースにフォールバックを追加する
- [x] 3.2 `formatDateForDisplay` を拡張し、「実データ精度→表示粒度→和暦変換」の順で処理する(design.md D4)。`gregorianToWareki` が `null` を返す場合(明治より前)は西暦表示にフォールバックする(design.md D5)
- [x] 3.3 `display-settings-store.ts` に `calendarMode` の状態と `setCalendarMode` を追加する
- [x] 3.4 `DisplaySettingsControl.tsx` に表示形式(西暦/和暦)のセレクトを追加する(design.md D7)
- [x] 3.5 `display-settings.test.ts` / `display-settings-store.test.ts` にテストを追加する。完了条件: 和暦変換、粒度設定との組み合わせ、明治より前の日付のフォールバックの各ケースを確認する

## 4. 表示設定: カード表示項目の選択

- [x] 4.1 `display-settings.ts` に `visibleCardFields`(`surname`/`given`/`furigana`/`birthDate`/`deathDate`/`birthPlace`/`deathPlace`/`age`/`genderIcon` の各boolean)を追加する(design.md D8)。デフォルトは現状のカード表示と完全一致させ、既存設定と同様キー単位のフォールバックを持たせる
- [x] 4.2 `display-settings-store.ts` に `visibleCardFields` の状態とsetterを追加する
- [x] 4.3 `DisplaySettingsControl.tsx` にカード表示項目のチェックボックス群を追加する。姓・名を両方非表示にした場合の影響を説明文で明示する(design.md リスク対応)
- [x] 4.4 テストを追加する。完了条件: 項目ごとのオン/オフ切り替え、デフォルト値、キー単位のフォールバックを確認する(「フォールバック文言が表示されないこと」の描画側の確認は5.3で扱う)

## 5. 描画: カードデータ・キャンバス反映

- [x] 5.1 `src/rendering/to-family-chart-data.ts` の `FamilyChartCardData` に `surnameKana`/`givenKana`/`birthPlace`/`deathPlace` を追加し、`buildPersonDatums` で値を設定する
- [x] 5.2 `FamilyTreeCanvas.tsx` のカードHTML生成を `visibleCardFields`・`calendarMode` に応じて分岐させる(design.md D6/D8)。姓・名の表示ロジックを「表示対象かつデータが存在する」基準に再構成する
- [x] 5.3 `to-family-chart-data.test.ts` を更新し、ふりがな・生没地のカードデータへの反映を確認するテストを追加した。`FamilyTreeCanvas` のカードHTML生成(family-chart/D3統合)は既存コードベースにも単体テストの前例がないため、6.2の実機確認でカバーする

## 6. 確認・ドキュメント

- [x] 6.1 `npm run lint` / `npm run typecheck` / `npm run test` をすべて実行し、通過することを確認する
- [x] 6.2 開発サーバーで動作確認する。完了条件: 婚姻・離婚日の編集、和暦表示モードの切り替え、カード表示項目のトグル(姓を非表示にして名だけ表示する等)を実際にブラウザで確認する
- [x] 6.3 `README.md` を更新する。完了条件: 「表示設定」の説明に和暦表示モード・カード表示項目の選択を追記し、「人物情報の編集」周辺の説明に婚姻・離婚イベント編集を追記する
- [x] 6.4 `docs/gedcom-mapping.md` を確認する。完了条件: 今回の変更が既存のMARR/DIV対応記述の範囲内(新規GEDCOMタグの追加なし)であることを確認し、更新が不要であることを確かめる(`events(marriage)`→`MARR`、`events(divorce)`→`DIV`が既に文書化済みであることを確認。更新不要)

## 7. 婚姻線ラベル表示(design.md D9)

- [ ] 7.1 婚姻日ラベル用のヘルパー関数を追加する。既存の `marriageYear`(`to-family-chart-data.ts`)と同様の探索で、2人の配偶者間のFamilyの最初の婚姻イベント(`events.find(e => e.type === 'marriage')`)の日付を返す。完了条件: 該当Familyがない・婚姻イベントがない場合は `undefined` を返すことをテストで確認する
- [ ] 7.2 `src/settings/display-settings.ts` に `showMarriageDateOnLink: boolean`(デフォルト `false`)を `visibleCardFields` とは独立したフィールドとして追加する(design.md D9)。既存設定と同様キー単位のフォールバックを持たせる
- [ ] 7.3 `display-settings-store.ts` に `showMarriageDateOnLink` の状態と `setShowMarriageDateOnLink` を追加する
- [ ] 7.4 `DisplaySettingsControl.tsx` の「表示する項目」に「婚姻日(線)」のチェックボックスを追加する
- [ ] 7.5 `FamilyTreeCanvas.tsx` の `chart.setAfterUpdate`(`markLinkStyles` と同じフック)に、婚姻線(`path.link.spouse-link`)の中点へ婚姻日ラベルの `<text>` 要素を描画/更新/除去する処理を追加する(design.md D9のスパイク方式)。`showMarriageDateOnLink` がオフの場合は描画しない。`calendarMode` に追従して和暦/西暦を切り替える
- [ ] 7.6 `FamilyTreeCanvas.css` にラベルのスタイルを追加する(`pointer-events: none` でクリック操作を妨げないようにする等)
- [ ] 7.7 テストを追加する。完了条件: 7.1のヘルパー関数の単体テスト、`display-settings.test.ts`/`display-settings-store.test.ts` への `showMarriageDateOnLink` のデフォルト値・永続化・フォールバックのテストを追加する(DOM描画自体は7.9の実機確認でカバーする)
- [ ] 7.8 `npm run lint` / `npm run typecheck` / `npm run test` をすべて実行し、通過することを確認する
- [ ] 7.9 開発サーバーで動作確認する。完了条件: 「婚姻日(線)」をオンにして婚姻線に日付が表示されること、和暦モードで元号表示に切り替わること、離婚済みの家族でも婚姻線に婚姻日のみ表示され離婚日が表示されないこと、デフォルトでは非表示のままであることを実際のブラウザで確認する
- [ ] 7.10 `README.md` の「表示設定」の説明に婚姻線ラベル表示を追記する

# Tasks: add-gedcom-json-import-export

## 改訂メモ

実装中に判明した方針転換(design.md Context参照)に伴い、タスク1・2(独自データモデル・和暦変換の新規実装)は**不要になった**(`family-tree-creation-ui` チェンジがマージ済みの `family-data-model` ケーパビリティで代替される)。当初実装したコード(`src/domain/person.ts` 等、`src/lib/wareki/`)は削除し、以降のタスクは既存の `TreeDocument`/`Person`/`Family`/`FuzzyDate` を対象に再実装した。以下は転換後の実績を反映する。

## 1. 内部データモデル

- [x] 1.1〜1.3 **不要(既存の `family-data-model` ケーパビリティで充足済み)**。当初実装した独自データモデル(`src/domain/person.ts`/`family.ts`/`date.ts`/`name.ts`/`model.ts`/`id.ts`)は削除した。

## 2. 和暦⇄西暦変換

- [x] 2.1〜2.4 **不要(既存の `src/domain/wareki.ts`/`parse-date.ts` で充足済み)**。当初実装した独自の和暦変換モジュール(`src/lib/wareki/`)は削除した。

## 3. GEDCOM構文層(src/lib/gedcom)

- [x] 3.1 GEDCOM行パーサを実装する(level / xref / tag / value の解釈、CONT/CONC の結合、行番号の保持、GedcomNode ツリーの構築)
  - 完了条件: 代表的なGEDCOM断片がツリー化され、不正な行が行番号付きのエラー/警告になることをユニットテストで確認
  - 備考: `TreeDocument` に依存しない純粋な構文層として実装(`domain/gedcomNode.ts` の `GedcomNode` 型のみ使用)。方針転換後も変更なし
- [x] 3.2 GEDCOMシリアライザを実装する(ツリー→テキスト、改行を含む値のCONT分割、長い行のCONC分割)
  - 完了条件: 構文層単体で parse→serialize→parse のラウンドトリップが等価になることをユニットテストで確認

## 4. 文字コード処理(src/lib/gedcom)

- [x] 4.1 エンコーディング判定+デコードを実装する(BOM検出→UTF-8厳格デコード→失敗時Shift_JISフォールバック、UTF-16対応、CHARタグ参照、ANSEL検出時は中断エラー、判定結果を返却)
  - 完了条件: UTF-8(BOM有無)・UTF-16・Shift_JISの日本語フィクスチャが文字化けなく読め、ANSELが中断エラーになることをユニットテストで確認

## 5. GEDCOM意味層(バージョン判定・マッピング、TreeDocument対応)

- [x] 5.1 ヘッダからのバージョン自動判定(7.0 / 5.5.1)と、GEDCOMとして解釈不能な場合の中断エラーを実装する
  - 完了条件: 7.0/5.5.1ヘッダが正しく判定され、ヘッダなしテキストが平易なメッセージの中断エラーになることをユニットテストで確認
- [x] 5.2 氏名マッピングを実装する(`docs/gedcom-mapping.md` 準拠: NAME の SURN/GIVN サブ構造、ふりがなは拡張タグ `_KANA_SURN`/`_KANA_GIVN`)
  - 完了条件: 旧字体の保持とふりがなの相互変換をユニットテストで確認
- [x] 5.3 日付マッピングを実装する(FuzzyDate⇄DATE。7.0はPHRASEで原文保全、5.5.1は構造化値+兄弟NOTEまたは丸括弧の日付句。ABT/BEF/AFT/BET…AND修飾子)
  - 完了条件: 構造化日付・修飾子・between・原文のみの日付が両バージョンで往復することをユニットテストで確認
- [x] 5.4 続柄・家族関係種別マッピングを実装する(PEDI⇄Pedigree、拡張タグ`_FAM_KIND`⇄FamilyKind、HUSB/WIFE位置割当てと`_SPOUSE_ROLE_UNKNOWN`)
  - 完了条件: 養子のPEDI ADOPTED、事実婚(common-law)の`_FAM_KIND`が両バージョンで警告なく往復することをユニットテストで確認
- [x] 5.5 GEDCOMインポートを実装する(INDI/FAM→TreeDocument、FAMCのPEDI解決、ANULの離婚扱い変換+警告、未対応トップレベルレコードの警告付き無視、警告収集)
  - 完了条件: 養子・再婚・読み仮名・和暦PHRASE・5.5.1の`_KANA_SURN`等を含むフィクスチャがTreeDocumentへ変換されることをユニットテストで確認
- [x] 5.6 GEDCOMエクスポートを実装する(TreeDocument→ツリー、ヘッダGEDC.VERS、SURN/GIVN・PEDI・`_FAM_KIND`出力、5.5.1のCHAR UTF-8、3名以上パートナーの警告)
  - 完了条件: 養子・読み仮名・和暦原文・事実婚を含むTreeDocumentが仕様どおりの構造で出力されることをユニットテストで確認
- [x] 5.7 相互運用フィクスチャテストを追加する(MyHeritage・Gramps・FamilySearchの出力形式を模した5.5.1/7.0サンプルのインポートが警告許容で成立する)
  - 完了条件: 各フィクスチャで人物・家族が取り込まれ、未対応部分が警告として列挙されることをテストで確認
- [x] 5.8 GEDCOM export→importの意味的ラウンドトリップテストを追加する(養子・和暦原文・事実婚を含むTreeDocumentが同一バージョンで意味的に復元される)
  - 完了条件: 続柄・関係種別・日付原文が再インポート後も一致することをテストで確認

## 6. ネイティブJSON入出力(src/lib/json、TreeDocument対応)

- [x] 6.1 `TreeDocument` を検証するzodスキーマを実装し、エクスポート直列化(`JSON.stringify(document)`)を実装する
  - 完了条件: ふりがな・メモ・和暦由来のFuzzyDate原文を含むTreeDocumentの出力JSONに全情報が含まれることをユニットテストで確認
- [x] 6.2 JSONインポートを実装する(zodスキーマ検証、schemaVersion欠落・不一致の中断、失敗時は既存データ不変)
  - 完了条件: 正常なTreeDocumentが復元され、フィールド欠落・型不正・未知schemaVersionが平易なメッセージで中断されることをユニットテストで確認
- [x] 6.3 JSONラウンドトリップの等価性テストを追加する(養子・再婚・事実婚・和暦由来日付を含む複雑なTreeDocumentで エクスポート→インポート→深い等価比較)
  - 完了条件: 復元TreeDocumentが元と深い等価であることをテストで確認

## 7. ファイル入出力UI(SettingsMenuへの統合)

- [x] 7.1 `ImportExportControl` コンポーネントを実装し `SettingsMenu` に組み込む(ファイル選択+ドラッグ&ドロップ、拡張子による形式判別〈.ged/.json〉、20MB上限の事前チェック、中断エラーの平易な日本語表示)
  - 完了条件: D&Dとファイル選択が同一処理に合流し、20MB超・不正ファイルで既存データを変えずエラー表示されることをコンポーネントテストで確認
- [x] 7.2 インポート結果サマリと既存データの上書き確認を実装する(人物数・家族数・判定エンコーディング・警告一覧の表示。既存データがある場合は確認ステップを経てから`useTreeStore.replace()`)
  - 完了条件: 既存データがある状態でのインポートが確認前は反映されず、確認後にストアへ反映されることをコンポーネントテストで確認
- [x] 7.3 エクスポートUIを実装する(GEDCOM 7.0/5.5.1互換/JSONの3形式選択+用途説明1行、個人情報を含む旨の注意書き、Blobダウンロード、エクスポート時警告の表示)
  - 完了条件: データが0件だとエクスポートボタンが無効化され、データがあるとダウンロードが発生し、注意書きが表示されることをコンポーネントテストで確認
- [x] 7.4 `useTreeStore`/`usePersistedTree` と統合し、インポートしたデータが編集画面・IndexedDB永続化にそのまま反映されることを確認する
  - 完了条件: ブラウザ上でGEDCOMインポート→サマリ確認→編集画面への反映→3形式エクスポートが一連で操作できることを手動確認

## 8. 検証・仕上げ

- [x] 8.1 クライアント完結の検証を行う(入出力処理コードにネットワークAPI呼び出しが存在しないことのレビュー+Playwrightでのネットワークリクエスト計測)
  - 完了条件: インポート/エクスポート操作中に外部への通信が1件も発生しない
- [x] 8.2 README.md を更新する(対応フォーマット〈GEDCOM 7.0 / 5.5.1互換 / JSON〉、文字コード対応、制限事項〈ANSEL非対応・サイズ上限・非標準タグ非保全〉、クライアント完結の明記)
  - 完了条件: README の記載だけで対応フォーマットと制限事項が把握できる
- [x] 8.3 OpenSpecアーティファクト(proposal/design/specs)を方針転換後の実装内容に合わせて更新する
  - 完了条件: `family-data-model` をNew Capabilitiesから除去し、gedcom-import-export/json-import-exportのシナリオを実際のフィールド名・タグ名に合わせ、design.mdに転換の経緯とRisksを記録する。`openspec validate` に合格する
- [x] 8.4 インターネット上の実在するGEDCOMサンプルファイルでインポート・再エクスポートを検証する
  - 完了条件: GEDCOM公式テストスイート(`gedcom7code/test-files`、7.0/5.5.1双方の代表的エッジケース27種)と実データ(`royal92.ged`欧州王族3,010人、5.5.1仕様書サンプル)をダウンロードし、クラッシュなく処理できることを確認する。仕様どおり拒否されるべきファイル(GEDC.VERS欠落、ANSEL)は明確なエラーメッセージで中断されることを確認する
  - 結果: 27/30ファイルが正常取込・両バージョン再エクスポート成功、3件(バージョン情報欠落1件・ANSEL 2件)は仕様どおり中断。検証中に2件の実装不備を発見し修正した: (1) BOMなしUTF-16ファイルが未検出だった問題(ヒューリスティック検出`detectBomlessUtf16`を追加)、(2) JULIAN等の未対応暦種別接頭辞・FROM等の範囲表現を年のみとして誤読していた問題(認識できない月トークンがある場合は部分成功させず原文保持のみへフォールバックするよう修正)。回帰テストを追加(`encoding.test.ts`・`dateMapping.test.ts`)。詳細はdesign.mdの「実ファイルでの検証」を参照
- [ ] 8.5 品質ゲートを全通過させ、develop へのPRで dev 環境動作確認する
  - 完了条件: lint / typecheck / test / build が全て成功し、dev 環境URLでインポート→エクスポートの一連操作が動作する
  - 進捗: `npm run lint` / `npm run typecheck` / `npm run format:check` / `npm run test`(174件全成功) / `npm run build` をすべてローカルで実行し成功を確認済み。PR #12(`claude/gedcom-json-import-export-yz6rph` → `develop`)を作成済み。dev環境(Cloudflare)でのデプロイ後動作確認は未実施。

# Design: add-gedcom-json-import-export

## Context

本変更の実装は当初「内部データモデルを本変更で新規定義する」前提で始まったが、実装途中に並行チェンジ `family-tree-creation-ui` が `develop` へ先にマージされ、`TreeDocument`/`Person`/`Family`(`src/domain/types.ts`)という内部データモデル・IndexedDB永続化・family-chartによる編集画面・GEDCOM 7.0マッピング対応表(`docs/gedcom-mapping.md`)がすでに存在することが判明した(これらは `openspec/specs/family-data-model/spec.md` として main spec 化済み)。

ユーザー確認のうえ、本変更は独自モデルを新設せず、**既存の `TreeDocument`/`Person`/`Family` と `docs/gedcom-mapping.md` に従って実装する方針へ転換した。** 以下は転換後の最終的な設計判断を記す(当初案は D3〜D5 の代替案欄に経緯として残す)。

前提・制約:

- 無料版の絶対制約として、処理はすべてブラウザ内で完結させる(後述のデータフロー参照)。
- データモデル自体(型定義・和暦変換・日付パース)は `family-data-model` ケーパビリティの所有物であり、本変更では変更しない。本変更はその上に GEDCOM/JSON の入出力層を追加するのみ。
- 和暦・不完全日付・旧字体・複雑な家族関係(養子・再婚・複数配偶者・事実婚)は既存モデルがすでに表現可能。

### データフロー(必須明記事項)

- **すべての処理はクライアント(ブラウザ)内で完結する。** ファイルの読み込みは File API、書き出しは Blob + ダウンロードリンクで行い、家系図データ・個人情報はサーバ・外部APIへ一切送信しない(Playwrightでのネットワーク計測により実測確認済み)。
- 本変更にネットワーク通信を伴うコードは存在しない(静的アセットの配信のみ)。Supabase・Gemini 等の外部サービスは不使用のため、RLS設計・外部API送信データの最小化方針は本変更では該当なし。
- データの存在場所: インポート元ファイル(ユーザー端末)→ `useTreeStore` 上の `TreeDocument`(ブラウザのメモリ・IndexedDB)→ エクスポートファイル(ユーザー端末)。永続化・undo/redo履歴の扱いは既存の `family-data-model`/`local-autosave` ケーパビリティに従う(インポートは `replace()` を使うためundo履歴はクリアされる。設計はGoals/Non-Goals参照)。

## Goals / Non-Goals

**Goals:**

- 既存 `TreeDocument` を対象とした GEDCOM 7.0 / 5.5.1 のインポート、GEDCOM 7.0 / 5.5.1互換モードのエクスポート
- ネイティブJSON形式(`TreeDocument.schemaVersion` を利用)でのロスレスな入出力
- 未対応レコード・解釈不能データを安全に無視しつつ、インポート結果サマリ(警告一覧)を提示
- 日本語環境で流通するファイルの文字コード対応(文字化け防止)
- 既存の設定メニュー(`SettingsMenu`)へのファイル入出力UI統合(ドラッグ&ドロップ・上書き確認)

**Non-Goals:**

- 内部データモデル自体の変更・拡張(`family-data-model` ケーパビリティの範囲外)
- **GEDCOMの任意の非標準タグを汎用的に保全し再エクスポート時に復元する仕組み。** `TreeDocument`/`Person`/`Family` にそのための保全領域(unmappedTags相当)が存在しないため、`docs/gedcom-mapping.md` が定義する既知のフィールド・拡張タグ(`_KANA_SURN`/`_KANA_GIVN`/`_FAM_KIND`/`_SPOUSE_ROLE_UNKNOWN`/`_TREE_TITLE`)以外の情報は警告付きで安全に破棄する(当初案からのスコープ縮小。Risks参照)
- GEDCOMのANSELエンコーディング対応(日本語ファイルでの流通が稀なため。検出時は警告を出して読み込み中断)
- GEDCOMのマルチメディア(OBJE)ファイル本体の取り込み(参照情報のみ、実際には警告付きで無視)
- 家系図描画・編集UI自体の変更、PNG/PDF出力、有償版機能との接続

## Decisions

### D1. GEDCOM処理は自前実装とする(ライブラリ不採用)

- **決定**: GEDCOM行構文(level / xref / tag / value + CONT/CONC)のパーサ・シリアライザを自前実装し、その上に `TreeDocument` とのマッピング層を置く。
- **理由**:
  - npmの既存ライブラリ(`read-gedcom`、`parse-gedcom` 等)は 5.5.1 の「パースのみ」が中心で、GEDCOM 7.0 対応・シリアライズという本変更の要件を満たすものがない。
  - GEDCOMの行構文自体は単純で、パーサコアの実装コストは小さい。仕様解釈の中心はマッピング層にあり、そこはライブラリを使っても自前で書く必要がある。
  - 依存を増やさないことで、ライセンス・保守停止リスクを回避する。
- **代替案**: `read-gedcom`(MIT, TS)を採用しインポートのみ委譲する案は、7.0非対応とエクスポート側の自前実装が結局必要になる点で却下。

### D2. 汎用GEDCOMツリーを中間表現とし、「構文層」と「意味層」を分離する

- **決定**: `GedcomNode { tag, value?, xref?, lineNumber?, children[] }` の汎用ツリーを中間表現とし、①テキスト⇄ツリー(構文層、`lib/gedcom/parser.ts`/`serializer.ts`)、②ツリー⇄`TreeDocument`(意味層、`lib/gedcom/import.ts`/`export.ts`)の2段構成にする。
- **理由**: 7.0と5.5.1のタグ名・構造の違いを意味層のマッピングテーブルで吸収できる。構文層は `TreeDocument` の形に一切依存しない純粋なGEDCOM行構文パーサとして独立させられる。
- **代替案**: テキストから直接 `TreeDocument` へ変換する1段構成は、構文解釈とバージョン差異吸収が絡み合い複雑化するため却下。

### D3. 内部データモデルは既存の `TreeDocument`/`Person`/`Family` をそのまま用いる

- **決定**: 本変更専用のデータモデルは新設しない。`family-data-model` ケーパビリティの型(`Person`: 氏名・性別・生没イベント・メモ、`Family`: `spouseIds`・`kind`〈married/common-law/unknown〉・`events`〈婚姻/離婚の時系列リスト〉・`children`〈続柄付き子リンク〉)をそのままGEDCOM/JSONの変換対象とする。ID・IDへの参照解決・整合性維持はすべて既存の `domain/commands.ts`/`domain/helpers.ts` に委譲する。
- **理由**: 実際に編集・永続化・描画で使われているモデルと入出力対象が同一であることが必須(別モデルだとインポートしたデータが編集画面に反映されない)。`docs/gedcom-mapping.md` がすでにGEDCOM 7.0との対応関係を項目単位で定義済み。
- **経緯(却下した当初案)**: 本変更独自に `Person`/`Family`(`partnerIds`/`relationshipType`/`unmappedTags`保全領域を持つ形)を新設する案で実装を開始したが、Context記載の理由により、既存モデルへの統合に転換した。

### D4. 日付は既存の `FuzzyDate`/`CalendarDate` をそのまま用いる

- **決定**: `FuzzyDate { original, qualifier: 'exact'|'about'|'before'|'after'|'between', date?: CalendarDate, date2?: CalendarDate }`(`domain/types.ts`)をGEDCOMのDATE構造と相互変換する。日付は常にグレゴリオ暦の `CalendarDate` として保持され(和暦は入力・表示時の変換のみ、`domain/wareki.ts`)、`original` に入力原文を保持する。
  - GEDCOM 7.0エクスポート: 西暦変換した構造化DATE値(ABT/BEF/AFT/BET…AND修飾)を出力し、原文は `PHRASE` で保全する。
  - GEDCOM 5.5.1エクスポート(本変更の追加設計。7.0向けの`docs/gedcom-mapping.md`はPHRASEを前提とするが5.5.1にPHRASEはないため): 構造化DATE値のみを出力し、原文は兄弟 `NOTE`(「元の表記: …」)で保全する。構造化できない日付(`date`が`undefined`)は丸括弧の日付句 `(原文)` として出力する。
  - GEDCOMインポート: DATE値を構造化して`date`/`date2`へ、`PHRASE`があれば`original`として優先する。5.5.1の兄弟NOTE(「元の表記: …」)も`original`として読み戻す。
- **理由**: `family-data-model` の日付表現をそのまま用いることで、インポートしたデータが既存の日付編集UI(`WarekiDateInput`)でそのまま扱える。
- **既知の制約**: `domain/parse-date.ts` の和暦パーサは漢数字(例:「明治十年」)に対応しておらず、アラビア数字(「明治10年」)のみ解釈できる。これは `family-data-model` ケーパビリティの既存動作であり、本変更の対象外。

### D5. 氏名・続柄・関係種別は `docs/gedcom-mapping.md` の対応表に厳密に従う

- **決定**:
  - 氏名(`PersonName { surname?, given?, surnameKana?, givenKana? }`): GEDCOMの `NAME` は `SURN`/`GIVN` サブ構造にマッピングし、ふりがなは拡張タグ `_KANA_SURN`/`_KANA_GIVN` を使う(対応表の指定どおり)。旧字体・異体字は正規化せずそのまま出力する。
  - 続柄(`Pedigree`: biological/adopted/step/foster/unknown): GEDCOMの `PEDI`(birth/adopted/foster/other/unknown)と対応表どおりに相互変換する。PEDIタグが省略されている場合は、他ツールの慣行(省略=実子)に合わせ `biological` とみなす。
  - 家族の関係種別(`FamilyKind`: married/common-law/unknown): 対応表が指定する拡張タグ `_FAM_KIND` を主とする。7.0/5.5.1のどちらでも同一の拡張タグで表現できるため、**5.5.1でも事実婚(common-law)を情報欠落なく出力でき、当初案にあった「5.5.1では表現できないためNOTEで代替し警告する」という設計は不要になった**(D2旧案からの変更点)。
  - HUSB/WIFEの割当て: 対応表の「性別に応じてHUSB/WIFEを選び、不明な場合は`_SPOUSE_ROLE_UNKNOWN`拡張タグを付与する」方針を単純化し、`spouseIds[0]→HUSB`・`spouseIds[1]→WIFE` の位置的割当てとしたうえで、性別が典型的な組合せ(HUSB=male かつ WIFE=female)でない場合に `_SPOUSE_ROLE_UNKNOWN` を付与する。インポート側は位置(HUSB→先頭、WIFE→2番目)で `spouseIds` を復元する(`Family.spouseIds` はただの配列で役割を持たないため、位置に意味はない)。
- **理由**: 対応表をそのまま実装することで、`family-data-model` の設計時点で想定されていたGEDCOM互換性を実現する。
- **代替案**: 独自の `_KANA` タグ・`EVEN`/`TYPE`構造での関係種別表現を検討したが(本変更の初期案)、既存の対応表と矛盾するため却下。

### D6. 文字コードの取り扱い

- **決定**:
  - **インポート**: BOMとGEDCOMヘッダの`CHAR`タグ、およびデコード試行(UTF-8厳格デコード→失敗時 Shift_JIS)で判定する。対応: UTF-8(BOM有無とも)、UTF-16(BOM付き、およびBOMなしをヒューリスティックで検出)、Shift_JIS(国産ソフト由来ファイル対策。`TextDecoder('shift_jis')`使用)。ANSELは検出時に警告を出して中断する。
  - **エクスポート**: 常にUTF-8(BOM付き)。5.5.1互換モードでも `CHAR UTF-8` を出力する(5.5.1でも合法)。
- **理由**: 日本語GEDCOMの文字化けは移行体験を致命的に損なう。Shift_JISは規格外だが国産買い切りソフト由来のファイルで現実に流通しているため受け入れる。
- **代替案**: UTF-8のみ対応は移行ユースケースを狭めるため却下。
- **実装後の修正(実ファイル検証で判明)**: 当初は「UTF-16はBOM必須」としていたが、GEDCOM公式テストスイート(`gedcom7code/test-files`)の5.5.1サンプルにBOMなしUTF-16ファイルが実在することが判明したため、先頭バイト列の0x00出現パターンによるヒューリスティック検出(`detectBomlessUtf16`)を追加した。

### D7. JSONネイティブ形式は `TreeDocument` の直列化 + zodバリデーション

- **決定**: ネイティブJSONは `TreeDocument` オブジェクトそのものを `JSON.stringify` する(ラッパー構造を持たない)。`TreeDocument` はすでに `schemaVersion` フィールドを持つため、別途エンベロープを設けない。インポート時は `zod`(MIT、新規依存として追加)で `TreeDocument` の形状を検証し、`schemaVersion` が `SCHEMA_VERSION`(現行値)と一致しない場合はエラーとする(将来のマイグレーション関数は `persistence/db.ts` の `MIGRATIONS` の枠組みと将来的に統合される想定だが、本変更ではv1のみのため未実装)。
- **理由**: `TreeDocument` は永続化層でもそのままIndexedDBに保存される正本の形であり、JSONバックアップ形式として直接採用するのが最も単純で欠落がない。実行時検証は不正ファイル・改変ファイルからアプリ状態を守るために必須。
- **代替案**: 別途JSONエクスポート専用の型を新設する案は、`TreeDocument` と二重管理になり乖離するリスクがあるため却下。

### D8. インポート結果サマリと警告の設計

- **決定**: GEDCOMインポートは `{ success, document, version, encoding, warnings: ImportWarning[] }` を返す。警告は「行番号・対象タグ・内容」を構造化して持ち、UIで人数サマリ(人物N名・家族M件)と警告一覧を平易な日本語で表示する。警告があってもインポート自体は成立させる(ベストエフォート方針)。エラーで中断するのは、GEDCOMとして解釈不能・非対応エンコーディング・JSONスキーマ不一致の場合のみ。
- **理由**: 競合(Gramps等)のエラーの難解さがUX不満点であり、「隠さず・怖がらせず」提示することが差別化になる。
- **代替案**: 厳格モード(警告=失敗)は他サービス産の不完全なファイルを実質受け入れられなくなるため却下。

### D9. エクスポートUIのデフォルトはGEDCOM 7.0、5.5.1互換を明示的に選択可能にする

- **決定**: エクスポート形式は「GEDCOM 7.0(推奨)/ GEDCOM 5.5.1互換(他サービス取込用)/ JSON(完全バックアップ)」の3択。UI上で各形式の用途を1行で説明する。
- **理由**: プロジェクト方針としては7.0が主軸だが、事実上の業界標準は5.5.1でありMyHeritage等への移行には5.5.1が安全。用途ラベルでユーザーが迷わず選べるようにする。
- **代替案**: デフォルト5.5.1は、7.0で拡張された表現力を既定で捨てることになるため採らない。

### D10. 実行モデル: メインスレッドで同期処理(Web Workerは導入しない)

- **決定**: パース・シリアライズはメインスレッドで同期実行する。個人利用の家系図(数百〜数千人規模、数MB以下)では体感遅延が問題にならない想定。ファイルサイズ上限(20MB)を設け、超過時は明示的にエラーとする。
- **理由**: Web Worker導入はビルド・テスト構成を複雑にする。ボトルネックが実測されてから後続チェンジで移行すればよい。
- **代替案**: 最初からWorker化する案は時期尚早な最適化として却下。

### D11. UI統合: 既存の `SettingsMenu` にインポート/エクスポートを追加し、`useTreeStore` と直結する

- **決定**: `src/components/ImportExportControl.tsx` を新設し、`DataResetControl` と同様に `SettingsMenu` から開くダイアログとして実装する。インポート成功時は `useTreeStore().replace(document)` でストアを直接更新する。既存データ(人物1名以上)がある状態でのインポートは、`DataResetControl` に準じた確認ステップ(破壊的操作の一拍置いた確認)を経てから `replace()` を呼ぶ。エクスポートは `useTreeStore().document` を直接読み出す。
- **理由**: 本変更のスコープ外だった独立App(App.tsx全体を差し替える設計)ではなく、`family-tree-creation-ui` がすでに構築した唯一のアプリ本体に統合することで、インポートしたデータが即座に編集画面・IndexedDB永続化に反映される。
- **代替案(当初案)**: 独立した `App.tsx`(データを`useState`で保持するのみ)による最小UIを本変更で新設する案は、D3の転換に伴い破棄した。

### モジュール構成(実装の指針)

```
src/
  domain/
    gedcomNode.ts    # GEDCOM構文層が使う汎用ツリー型(GedcomNode)。family-data-model非依存
    types.ts commands.ts helpers.ts wareki.ts parse-date.ts  # family-data-model(既存・変更なし)
  lib/
    gedcom/          # 構文層(parser/serializer/encoding/version)+ 意味層(nameMapping/dateMapping/pedigree/import/export)
    json/            # ネイティブJSON(TreeDocument)の入出力・zodスキーマ検証
  components/
    ImportExportControl.tsx  # SettingsMenuから開く入出力UI
  features/
    import-export/
      fileIO.ts      # ファイル読込・ダウンロードの共通ヘルパー
```

## Risks / Trade-offs

- **[非対応タグ保全なし]** 当初案にあった「GEDCOMの非標準タグを汎用的に保全し再エクスポート時に復元する」機能は、`TreeDocument` にその保全領域が無いため実装しない(Non-Goals参照)。`docs/gedcom-mapping.md` が定義する既知のタグ以外は、警告を出したうえで安全に破棄される → GEDCOM経由の往復では対応表外の情報を保持できないことをREADME等で明示する。JSON形式(`TreeDocument`の直列化)を「完全バックアップ」として案内し、往復保存が必要な場合はJSONを使うよう誘導する。
- **[GEDCOM実装の仕様解釈誤り]** 自前実装のため、他サービスとの相互運用で想定外の差異が出る可能性 → 意味層をテーブル駆動にして修正を局所化。MyHeritage・Gramps・FamilySearch が出力したサンプルファイルを模したフィクスチャでの相互運用テストを実装。
- **[Shift_JIS判定の誤検出]** エンコーディング自動判定は原理的に誤り得る → UTF-8厳格デコードを最優先し、失敗時のみShift_JISへフォールバック。判定結果をインポートサマリに表示し、文字化け時にユーザーが気づけるようにする。
- **[3名以上のパートナー]** `Family.spouseIds` は配列で3名以上も型上は許容するが、GEDCOMのHUSB/WIFEは2枠が標準 → 3人目以降は非標準的にWIFEタグを追加出力しつつ警告を出す(再インポート時は先頭2名のみ復元される制約を許容)。
- **[婚姻取消(ANUL)の表現欠落]** `FamilyEventType` は婚姻/離婚のみで婚姻取消の概念がない → インポート時はANULを離婚として扱い、警告で区別できない旨を明示する。
- **[大きなファイルでのUIブロック]** 同期処理のため巨大ファイルで一時的にUIが固まる → サイズ上限で明示エラー。実測で問題になればWorker化(D10)。
- **[インポートによるundo履歴の消失]** `replace()` は `past`/`future` をクリアするため、インポート後は直前の編集をundoで戻せない → 既存データがある場合は上書き確認(D11)で一拍置く。
- **[非対応の暦種別・日付範囲表現]** GEDCOMのJULIAN/FRENCH_R/HEBREW等の暦種別接頭辞や、BET…AND以外の範囲表現(FROM…TO等)は解釈しない → 実ファイル検証で「接頭辞を無視して数字部分だけを西暦年として誤読する」不具合を発見し修正済み(月トークンが認識できない場合は年のみへ部分成功させず、原文保持のみへ完全にフォールバックする)。日付原文は常に保持されるため情報は失われない。
- **[Person.birthは単一イベント]** `family-data-model` の `Person.birth` は単一の`LifeEvent`であり配列ではないため、GEDCOMのINDIに複数の`BIRT`イベントがある場合(まれ)は最初の1件のみが取り込まれる → `family-data-model` ケーパビリティの仕様であり本変更では変更しない。

## 実ファイルでの検証

`docs/gedcom-mapping.md` を策定した `gedcom7code/test-files`(GEDCOM 7.0/5.5.1の公式テストスイート)、および`royal92.ged`(欧州王族3,010人、GEDCOM 5.5実データ)・GEDCOM 5.5.1仕様書添付サンプルをインターネットから取得し、インポート→再エクスポートを実行して検証した。

- 27/30ファイルが問題なく取り込まれ、両バージョンへの再エクスポートもクラッシュしなかった(未対応レコード〈SOUR/OBJE/SNOTE/SUBN/_LOC等〉は警告付きで安全に無視された)。
- 3ファイルは仕様どおり中断された: `GEDC.VERS`を全く含まないファイル(バージョン不明として中断)、ANSELエンコーディングのファイル2件(Non-Goalどおり中断)。
- この検証で2件の実装不備を発見し修正した(上記Risks参照): (1) BOMなしUTF-16ファイルが検出できていなかった、(2) 未対応の暦種別接頭辞・範囲表現を年のみとして誤読していた。

## Migration Plan

- 新規機能のみで既存データへの破壊的変更はない。`TreeDocument` の型・`schemaVersion` は変更しない(`family-data-model` の変更を伴わない)。
- 通常フロー(feature → develop でdev環境確認 → main で本番)でデプロイする。
- ロールバックは `git revert` + 再デプロイのみ。サーバ側リソースの変更はない。

## Open Questions

なし(当初あった「_KANA vs ROMN」の論点は、既存の `docs/gedcom-mapping.md` が拡張タグ`_KANA_SURN`/`_KANA_GIVN`を指定しているため解消。「個人情報を含む旨の注意書き」もUI実装で確定済み)。

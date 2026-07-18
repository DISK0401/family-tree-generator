# Proposal: add-gedcom-json-import-export

## 改訂メモ(実装中の方針転換)

当初の proposal/design/specs は「本変更で内部データモデルを新規定義する」前提で書かれていた。しかし実装途中、並行して進んでいた `family-tree-creation-ui` チェンジ(手作業での家系図編集画面・IndexedDB永続化・family-chart描画)が `develop` へ先にマージされ、その中で **本変更が新規定義しようとしていたものと同種の内部データモデル**(`src/domain/types.ts` の `Person`/`Family`/`TreeDocument`)と、GEDCOM 7.0マッピング対応表(`docs/gedcom-mapping.md`)がすでに導入・archiveされ、`openspec/specs/family-data-model/spec.md` として main spec 化されていることが判明した。

ユーザー確認のうえ、**本変更は独自のデータモデルを新設せず、既存の `family-data-model` ケーパビリティ(`TreeDocument`/`Person`/`Family`)と `docs/gedcom-mapping.md` の対応表に従って実装する方針へ転換した。** 以下の本文はこの転換後の内容に更新している(取り消し線等は用いず、確定した仕様として記述する)。

## Why

無料版のコア価値である「クライアント完結・データはユーザーの手元」を成立させるには、家系図データをファイルとして持ち出し・持ち込みできる仕組みが不可欠である(サービス終了時のデータ消失不安・ベンダーロックインは競合への主要な不満点のひとつ)。`family-tree-creation-ui` チェンジによって手動編集画面と内部データモデルはすでに存在するため、本変更はその既存モデルを対象に GEDCOM(7.0/5.5.1互換)・JSON のインポート/エクスポートを実装する。

## What Changes

- **GEDCOMエクスポート**: 既存の `TreeDocument`(`family-data-model` ケーパビリティ) → GEDCOM 7.0 ファイル出力。`docs/gedcom-mapping.md` の対応表(SURN/GIVN、`_KANA_SURN`/`_KANA_GIVN` 拡張タグ等)に従う。互換性モードとして GEDCOM 5.5.1 形式での出力も選択可能にする。
- **GEDCOMインポート**: GEDCOM 7.0 / 5.5.1 ファイル → `TreeDocument` への変換。文字コード(UTF-8/UTF-16/Shift_JIS自動判定)とバージョン自動判定に対応する。解釈できない行・レコードは警告付きで読み飛ばし、インポート結果のサマリ(取込人数・警告一覧)をユーザーへ提示する。
- **JSONエクスポート/インポート**: `TreeDocument`(既存の `schemaVersion` を含む)をそのまま直列化・検証するアプリネイティブのJSON形式の入出力を実装する。GEDCOMで表現しきれない情報の完全バックアップ手段と位置づける。
- **ファイル入出力UI**: 既存の設定メニュー(`SettingsMenu`)にインポート/エクスポート機能を追加する。ドラッグ&ドロップ/ファイル選択でのインポート、ダウンロードによるエクスポート、既存データがある場合の上書き確認を含む。
- **README.md 更新**: 対応フォーマット(GEDCOM 7.0 / 5.5.1互換 / JSON)と制限事項を記載する。

破壊的変更: なし(新規機能のみ。既存の家系図編集画面に入出力機能を追加する)。

### スコープ外(後続チェンジで扱う)

- 家系図の描画・編集UI自体の変更、PNG/PDF出力(`family-tree-creation-ui` の範囲)
- 有償版(クラウド保存・戸籍OCR)との連携
- GEDCOMの任意の非標準タグを汎用的に保全する仕組み(既存 `TreeDocument` にその保全領域がないため。詳細は design の Non-Goals を参照)

### 無料版 / 有償版への影響

- 対象は**無料版**(クライアント完結)。GEDCOM/JSON変換ロジックが対象とする `TreeDocument` は、有償版の戸籍OCR結果の構造化出力やクラウド保存でも共通利用される想定(`family-data-model` ケーパビリティの前提)。

### 競合調査とUX方針

- MyHeritage・FamilySearch・Gramps は GEDCOM 対応済みで、データ移行手段の提供は業界標準。一方、国内競合(みんなの家系図、買い切りWindowsソフト群)はGEDCOM対応が弱く、移行不安が不満点として顕在化している。GEDCOM入出力は国内市場での明確な差別化ポイント。
- UXで既存製品を上回るための方針: ①インポート時に警告・非対応項目を隠さずサマリ表示(Gramps等は玄人向けでエラーが難解)、②非対応タグもデータとして保全し再エクスポート時に欠落させない、③日本語環境で流通するファイルの文字化けを防ぐエンコーディング処理、④ドラッグ&ドロップ対応の簡単な操作。

### プライバシー・法務への影響

- インポート/エクスポートはすべて**ブラウザ内(クライアントサイド)で完結**し、家系図データ・個人情報をサーバへ送信しない。無料版の絶対制約に適合し、データフローの変更はない(静的アセット配信のみ)。
- エクスポートファイルはユーザー自身の端末に保存されるため、取り扱い注意(親族の個人情報を含む旨)をUI上で注記することを design で検討する。
- 法務上の新たな論点なし(事実証明文書の生成には該当しない)。

### ロールバック方針

- すべて git 管理のフロントエンドコードであり、`git revert` と再デプロイで巻き戻し可能。サーバ側リソース・外部サービス設定の変更はない。
- ユーザーデータ移行の考慮も不要(本変更時点では永続化ストアが存在しないため)。JSONスキーマにはバージョン番号を持たせ、将来の互換性問題に備える。

## Capabilities

### New Capabilities

- `gedcom-import-export`: GEDCOM 7.0 のインポート/エクスポートと GEDCOM 5.5.1 互換モード。バージョン・文字コードの取り扱い、`docs/gedcom-mapping.md` に基づくタグ対応、インポート結果サマリの提示を含む。
- `json-import-export`: アプリネイティブJSON形式(既存の `TreeDocument.schemaVersion` を用いた検証付き)によるロスレスなエクスポート/インポート。

### Modified Capabilities

なし。`family-data-model` は本変更で要件変更しない(既存の型定義・変換ユーティリティをそのまま利用する)。

## Impact

- **新規コード**: `src/lib/gedcom/`(構文層パーサ/シリアライザ、文字コード判定、バージョン判定、意味層マッピング)、`src/lib/json/`(スキーマ検証・入出力)、`src/components/ImportExportControl.tsx`(UI)、および各ユニットテスト(Vitest)。
- **更新**: `src/components/SettingsMenu.tsx`(入出力UIの組み込み)、`README.md`。
- **依存関係**: GEDCOM処理は自前実装(design D1参照)。JSON検証に `zod` を追加。ライセンスはMIT。
- **CI/デプロイ**: 既存のPR品質ゲート・デプロイフローをそのまま利用(変更なし)。

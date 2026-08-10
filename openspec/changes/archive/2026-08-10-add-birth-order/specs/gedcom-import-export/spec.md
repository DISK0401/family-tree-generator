## MODIFIED Requirements

### Requirement: GEDCOM 7.0エクスポート
システムは `TreeDocument` をGEDCOM 7.0形式のファイルとしてエクスポートできなければならない(SHALL)。出力はUTF-8(BOM付き)とし、ヘッダに `GEDC.VERS 7.0` を含まなければならない(SHALL)。氏名(SURN/GIVN、ふりがなは拡張タグ `_KANA_SURN`/`_KANA_GIVN`)、日付(DATE+PHRASE)、続柄(PEDI)、家族関係種別(拡張タグ `_FAM_KIND`)、出生順(拡張タグ `_BIRTH_ORDER`)を `docs/gedcom-mapping.md` の対応表に従ってマッピングしなければならない(SHALL)。

#### Scenario: 基本的なエクスポート
- **GIVEN** 人物2名とその婚姻家族を含む `TreeDocument`
- **WHEN** GEDCOM 7.0形式でエクスポートする
- **THEN** INDIレコード2件・FAMレコード1件を含むGEDCOM 7.0ファイルがダウンロードされ、ヘッダにバージョン7.0が含まれ、FAMにHUSB/WIFEポインタが出力される

#### Scenario: 養子縁組のエクスポート
- **GIVEN** 実親の家族に続柄`biological`、養親の家族に続柄`adopted`として属する人物を含む `TreeDocument`
- **WHEN** GEDCOM 7.0形式でエクスポートする
- **THEN** 当該人物のINDIレコードに両家族へのFAMCリンクが出力され、続柄に応じたPEDI値(BIRTH/ADOPTED)がそれぞれ付与される

#### Scenario: 読み仮名のエクスポート
- **GIVEN** 姓「齋藤」ふりがな「さいとう」の人物を含む `TreeDocument`
- **WHEN** GEDCOM 7.0形式でエクスポートする
- **THEN** NAMEのSURNには旧字体「齋藤」がそのまま出力され、ふりがなは拡張タグ `_KANA_SURN` で出力される

#### Scenario: 和暦由来日付のエクスポート
- **GIVEN** 生年月日として和暦入力(例: 「明治10年頃」)から変換されたFuzzyDate(原文・西暦換算値・修飾子を保持)を含む人物
- **WHEN** GEDCOM 7.0形式でエクスポートする
- **THEN** DATE値には西暦換算の日付(ABT修飾付き)が出力され、和暦の原文はPHRASE構造で保全される

#### Scenario: 出生順のエクスポート
- **GIVEN** 出生順「2」が設定された人物を含む `TreeDocument`
- **WHEN** GEDCOM 7.0形式でエクスポートする
- **THEN** 当該人物のINDIレコードに拡張タグ `_BIRTH_ORDER 2` が出力され、ヘッダの`SCHMA`に`_BIRTH_ORDER`が宣言される

### Requirement: GEDCOM 5.5.1互換モードエクスポート
システムはGEDCOM 5.5.1互換形式でのエクスポートを選択できなければならない(SHALL)。出力はUTF-8とし、ヘッダに `VERS 5.5.1` と `CHAR UTF-8` を含まなければならない(SHALL)。事実婚など5.5.1に標準の対応構造がない関係種別は、7.0と同じ拡張タグ(`_FAM_KIND`)で出力し、情報を失ってはならない(MUST NOT)。出生順も同様に、7.0と同じ拡張タグ(`_BIRTH_ORDER`)で出力し、情報を失ってはならない(MUST NOT)。日付の原文は、DATEに構造化値のみを出力したうえで兄弟NOTE(「元の表記: …」)として保全しなければならない(SHALL)。

#### Scenario: 5.5.1互換モードでのエクスポート
- **GIVEN** 人物と家族を含む `TreeDocument`
- **WHEN** GEDCOM 5.5.1互換モードでエクスポートする
- **THEN** ヘッダに5.5.1とCHAR UTF-8が出力され、他サービス(5.5.1対応ソフト)が読み込める構造のファイルが生成される

#### Scenario: 事実婚(common-law)の5.5.1エクスポート
- **GIVEN** 関係種別が `common-law` の家族を含む `TreeDocument`
- **WHEN** GEDCOM 5.5.1互換モードでエクスポートする
- **THEN** FAMレコードに拡張タグ `_FAM_KIND common-law` が出力され、警告なしで情報が保全される

#### Scenario: 和暦原文の5.5.1保全
- **GIVEN** 和暦由来のFuzzyDate(原文「明治10年頃」)を持つ出生イベントを含む人物
- **WHEN** GEDCOM 5.5.1互換モードでエクスポートする
- **THEN** DATEには西暦換算値のみが出力され、同階層のNOTEに「元の表記: 明治10年頃」が出力される

#### Scenario: 出生順の5.5.1エクスポート
- **GIVEN** 出生順「1」が設定された人物を含む `TreeDocument`
- **WHEN** GEDCOM 5.5.1互換モードでエクスポートする
- **THEN** 当該人物のINDIレコードに拡張タグ `_BIRTH_ORDER 1` が出力され、警告なしで情報が保全される

### Requirement: GEDCOMインポートとバージョン自動判定
システムはGEDCOM 7.0および5.5.1のファイルをインポートし、`TreeDocument` へ変換できなければならない(SHALL)。バージョンはファイルヘッダから自動判定しなければならない(SHALL)。ヘッダが欠落・不正でGEDCOMとして解釈できない場合はインポートを中断し、理由を平易な日本語で表示しなければならない(SHALL)。

#### Scenario: GEDCOM 7.0ファイルのインポート
- **WHEN** GEDCOM 7.0形式のファイルを選択またはドラッグ&ドロップでインポートする
- **THEN** バージョンが自動判定され、人物・家族が `TreeDocument` に変換される

#### Scenario: GEDCOM 5.5.1ファイルのインポート
- **WHEN** 他サービスがエクスポートしたGEDCOM 5.5.1ファイルをインポートする
- **THEN** バージョンが自動判定され、人物・家族・拡張タグ `_KANA_SURN`/`_KANA_GIVN` によるふりがなが `TreeDocument` に変換される

#### Scenario: GEDCOMとして解釈できないファイル
- **WHEN** GEDCOMヘッダを持たないテキストファイルをインポートしようとする
- **THEN** インポートは中断され、「GEDCOMファイルとして読み込めない」旨が平易な日本語で表示され、既存のデータは変更されない

#### Scenario: 養子縁組を含むファイルのインポート
- **GIVEN** PEDI ADOPTEDを含むGEDCOMファイル
- **WHEN** インポートする
- **THEN** 当該の子リンクは続柄`adopted`として `TreeDocument` に変換される

#### Scenario: 婚姻取消(ANUL)の取り込み
- **GIVEN** ANULイベントを含むFAMレコード
- **WHEN** インポートする
- **THEN** 当該イベントは離婚(`divorce`)イベントとして取り込まれ、続柄モデルに対応する種別がない旨の警告が表示される(本モデルの `FamilyEventType` は婚姻/離婚のみを持つため)

#### Scenario: 出生順を含むファイルのインポート
- **GIVEN** 拡張タグ `_BIRTH_ORDER 3` を持つINDIレコードを含むGEDCOMファイル
- **WHEN** インポートする
- **THEN** 当該人物は出生順「3」を持つPersonとして `TreeDocument` に変換される

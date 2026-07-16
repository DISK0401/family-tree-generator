# GEDCOM 7.0 マッピング対応表

`src/domain/types.ts` の各フィールドと、GEDCOM 7.0(および5.5.1互換モード)タグとの対応関係を記す。GEDCOM入出力機能自体は本変更のスコープ外だが、データモデルの項目定義は本表への無損失マッピングを前提として設計している(将来のエクスポート/インポート実装時に本表を実装リファレンスとする)。

対応のないフィールドが存在しないことをレビュー観点とする。

## Person → INDI

| フィールド | GEDCOM 7.0タグ | 備考 |
|---|---|---|
| `id` | `@I<n>@`(ポインタ) | GEDCOM側はレコードポインタで管理。エクスポート時に採番する |
| `name.surname` | `NAME` の `SURN`(サブ構造) | GEDCOM 5.5.1互換モードでは `NAME` の `/姓/` 区切り記法へ変換 |
| `name.given` | `NAME` の `GIVN` | 同上、`/姓/` の前の部分 |
| `name.surnameKana` | `NAME` 内の拡張タグ `_KANA_SURN`(独自拡張) | GEDCOM標準に「かな読み」タグはないため拡張タグへ退避。5.5.1互換モードでは `NAME` の `ROMN`/`FONE`(音訳)構造の転用も検討 |
| `name.givenKana` | `NAME` 内の拡張タグ `_KANA_GIVN`(独自拡張) | 同上 |
| `gender` | `SEX`(`M`/`F`/`X`/`U`) | `unknown` → `U` |
| `birth` | `BIRT` イベント | `LifeEvent` → `BIRT` に写像(下表参照) |
| `death` | `DEAT` イベント | `LifeEvent` → `DEAT` に写像 |
| `note` | `NOTE` | 構造化ノート(`SNOTE`)も将来検討可 |

## Family → FAM

| フィールド | GEDCOM 7.0タグ | 備考 |
|---|---|---|
| `id` | `@F<n>@`(ポインタ) | エクスポート時に採番 |
| `spouseIds` | `HUSB` / `WIFE`(2名の場合)、`HUSB` または `WIFE` のみ(1名=ひとり親の場合) | GEDCOMは性別役割のタグ名だが、性別不明・同性カップルも空欄可の仕様上格納可能。`gender` に応じて`HUSB`/`WIFE`を選び、不明な場合は`HUSB`側に格納した上で`_SPOUSE_ROLE_UNKNOWN`(独自拡張)を付与する方針 |
| `kind` | `MARR` イベントの有無、および拡張タグ `_FAM_KIND`(独自拡張: `married`/`common-law`/`unknown`) | GEDCOM標準に「事実婚」を表すタグはないため拡張タグへ退避 |
| `events`(`marriage`) | `MARR` イベント(複数可) | GEDCOM 7.0はFAM内に同種イベントを複数回記述できるため、時系列リスト(復縁=婚姻→離婚→婚姻)を無損失で表現できる |
| `events`(`divorce`) | `DIV` イベント(複数可) | 同上 |
| `children[].childId` | `CHIL`(FAM→INDIの参照) | — |
| `children[].pedigree` | `CHIL` を指す `FAMC`(INDI側)の `PEDI` サブタグ | GEDCOMの`PEDI`は子(INDI)側の`FAMC`構造に付与される。値は `birth`/`adopted`/`foster`/`sealing`/`other` 等。本モデルの `Pedigree` は以下のとおり対応: |

### Pedigree ↔ PEDI 対応

| `Pedigree` | GEDCOM `PEDI` |
|---|---|
| `biological` | `birth` |
| `adopted` | `adopted` |
| `step` | `other`(GEDCOM標準に継子専用値がないため。5.5.1系ツールでは `step` を独自拡張するものもあり、その慣行を踏襲する) |
| `foster` | `foster` |
| `unknown` | (省略、またはFAMCに`PEDI`を付与しない) |

## LifeEvent(BIRT/DEAT/MARR/DIV共通)

| フィールド | GEDCOM 7.0タグ | 備考 |
|---|---|---|
| `type` | イベント種別タグそのもの(`BIRT`/`DEAT`/`MARR`/`DIV`) | — |
| `date` | イベント配下の `DATE` | `FuzzyDate` → `DATE` に写像(下表参照) |
| `place` | イベント配下の `PLAC` | — |

## FuzzyDate ↔ DATE

| フィールド | GEDCOM 7.0 `DATE` 表現 | 備考 |
|---|---|---|
| `original` | `DATE` 配下の `PHRASE`(自由記述の原文) | 和暦原文(例: 「昭和10年頃」)はここへ退避し、構造化日付とあわせて保持する |
| `date` / `date2` | `DATE` の暦日値(`GREGORIAN`カレンダー) | 年のみ・年月のみの部分日付はGEDCOMの部分日付表記(例: `1935`、`OCT 1935`)に対応 |
| `qualifier: 'exact'` | 修飾子なし | — |
| `qualifier: 'about'` | `ABT` | — |
| `qualifier: 'before'` | `BEF` | — |
| `qualifier: 'after'` | `AFT` | — |
| `qualifier: 'between'` | `BET <date> AND <date2>` | `date`/`date2` の両方を使用 |

## TreeDocument

| フィールド | GEDCOM 7.0タグ | 備考 |
|---|---|---|
| `schemaVersion` | (対応なし、内部管理のみ) | エクスポートには含めない。インポート時は現行値を採番 |
| `id` | (対応なし、内部管理のみ) | 同上 |
| `title` | `HEAD` 配下の `SOUR`/独自の `_TREE_TITLE`(拡張) | GEDCOM 7.0の`HEAD`に家系図タイトル専用タグはないため拡張タグへ退避 |
| `updatedAt` | `HEAD` の `DATE`(ファイル作成/更新日時) | — |
| `persons` | `INDI` レコード群 | — |
| `families` | `FAM` レコード群 | — |

## 拡張タグの命名規則

GEDCOM標準タグへ直接対応しない日本固有情報は、GEDCOM仕様のアンダースコア接頭辞規約に従い `_` 始まりの独自拡張タグとして退避する(例: `_KANA_SURN`, `_FAM_KIND`, `_TREE_TITLE`)。将来のインポート時、未知の `_` タグは無視するのではなく、対応するモデルフィールドへ読み戻せるよう実装する。

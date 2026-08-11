# GEDCOM 7.0 マッピング対応表

`src/domain/types.ts` の各フィールドと、GEDCOM 7.0(および5.5.1互換モード)タグとの対応関係を記す。本表は `src/lib/gedcom/` の**実装リファレンス**であり、実装と同期を保つ(乖離を見つけたらどちらかを直す)。

対応のないフィールドが存在しないことをレビュー観点とする。

## Person → INDI

| フィールド | GEDCOM 7.0タグ | 備考 |
|---|---|---|
| `id` | `@I<n>@`(ポインタ) | GEDCOM側はレコードポインタで管理。エクスポート時に採番する |
| `name.surname` | `NAME` の `SURN`(サブ構造) | `NAME` の行値にも `/姓/` 区切りで併記する。**インポート時、SURN/GIVN サブタグが無いファイルは NAME 行値(`名 /姓/ 接尾辞`)から補完する**(サブタグ省略は5.5.1世代ソフトで一般的) |
| `name.given` | `NAME` の `GIVN` | 同上。行値の `/姓/` より前が given、後置suffixは given 末尾へ空白区切りで保全 |
| `name.surnameKana` | `NAME` 内の拡張タグ `_KANA_SURN`(独自拡張)+ 標準の音訳構造を併記 | 併記: 5.5.1 は `FONE <かな値>`+`TYPE kana`、7.0 は `TRAN <かな値>`+`LANG ja-Kana`(他ソフトへ引き継ぐため)。インポートは `_KANA_*` 優先、無ければ FONE(TYPE kana/hiragana/katakana)/ TRAN(LANG ja-*)から補完 |
| `name.givenKana` | `NAME` 内の拡張タグ `_KANA_GIVN`(独自拡張)+ 同上 | 同上 |
| `gender` | `SEX`(`M`/`F`/`U`) | エクスポートは `unknown` → `U`。インポートは `X`(7.0)→ `unknown` +警告(「性別 X は『不明』として取り込みました」) |
| `birthOrder` | 拡張タグ `_BIRTH_ORDER`(独自拡張) | 家族内での出生順(性別非依存の数値)。GEDCOM標準に対応タグが無いため7.0/5.5.1共通で拡張タグへ退避する(`_FAM_KIND`と同じ往復パターン)。インポート時、値が正の整数として解釈できない場合は無視して警告を出す |
| `birth` | `BIRT` イベント | `LifeEvent` → `BIRT` に写像(下表参照) |
| `death` | `DEAT` イベント | `LifeEvent` → `DEAT` に写像 |
| `note` | `NOTE` | 構造化ノート(`SNOTE`)も将来検討可 |

氏名が完全に空(surname/given/かな全て未設定)の人物は `NAME` タグ自体を省略する(5.5.1 は NAME 値必須のため空値を出さない)。

## Family → FAM

| フィールド | GEDCOM 7.0タグ | 備考 |
|---|---|---|
| `id` | `@F<n>@`(ポインタ) | エクスポート時に採番 |
| `spouseIds` | `HUSB` / `WIFE`(2名の場合)、`HUSB` または `WIFE` のみ(1名=ひとり親の場合) | **gender に応じて割当**(male→`HUSB` / female→`WIFE` を優先。単独親の female も `WIFE` 枠)。両者同性・両者不明のときのみ登録順+`_SPOUSE_ROLE_UNKNOWN`(独自拡張)を付与。インポートは `_SPOUSE_ROLE_UNKNOWN` を読んだら警告を出す。**往復で spouseIds の順序は入れ替わり得る**(集合としては不変) |
| `kind` | `MARR` イベントの有無、および拡張タグ `_FAM_KIND`(独自拡張: `married`/`common-law`/`unknown`) | GEDCOM標準に「事実婚」を表すタグはないため拡張タグへ退避 |
| `events`(`marriage`) | `MARR` イベント(複数可) | GEDCOM 7.0はFAM内に同種イベントを複数回記述できるため、時系列リスト(復縁=婚姻→離婚→婚姻)を無損失で表現できる。**インポートはFAM配下を文書順に走査して時系列を保持する**(タグ種別ごとの一括読取は日付なしイベントの順序を壊すため行わない) |
| `events`(`divorce`) | `DIV` イベント(複数可) | 同上。`ANUL`(婚姻取消)は離婚として取り込み+警告(モデルに専用種別がないため) |
| `children[].childId` | `CHIL`(FAM→INDIの参照) | 参照先INDIが存在しない `CHIL` はリンクを取り込まず警告する(HUSB/WIFEの参照切れも同様)。重複 `CHIL`・`HUSB`=`WIFE` 同一人物は一意化+警告 |
| `children[].pedigree` | `CHIL` を指す `FAMC`(INDI側)の `PEDI` サブタグ | GEDCOMの`PEDI`は子(INDI)側の`FAMC`構造に付与される。対応は下表: |

### Pedigree ↔ PEDI 対応

| `Pedigree` | 7.0 エクスポート | 5.5.1 エクスポート | インポート(両バージョン) |
|---|---|---|---|
| `biological` | `BIRTH` | `birth` | `BIRTH`/`birth` → biological。**PEDI 欠落も biological**(5.5.1慣行) |
| `adopted` | `ADOPTED` | `adopted` | → adopted |
| `foster` | `FOSTER` | `foster` | → foster |
| `step` | `OTHER` + `PHRASE 継子` | `other`(独自値・後方互換) | 7.0: `OTHER`+`PHRASE 継子` → step(**7.0経由は往復無損失**)。5.5.1 の `other` は unknown+警告へ劣化(PHRASE 非対応のため) |
| `unknown` | `OTHER` + `PHRASE 続柄不明` | (PEDI 省略) | 7.0: `OTHER`+`PHRASE 続柄不明` → unknown(往復無損失)。5.5.1 経由は省略→biological へ劣化(許容)。PHRASE なし/判別不能な `OTHER` → unknown+警告。旧アプリ出力の `UNKNOWN`/`unknown` → unknown(後方互換・警告なし)。`SEALING` → unknown+警告 |

## LifeEvent(BIRT/DEAT/MARR/DIV共通)

| フィールド | GEDCOM 7.0タグ | 備考 |
|---|---|---|
| `type` | イベント種別タグそのもの(`BIRT`/`DEAT`/`MARR`/`DIV`) | — |
| `date` | イベント配下の `DATE` | `FuzzyDate` → `DATE` に写像(下表参照) |
| `place` | イベント配下の `PLAC` | — |

## FuzzyDate ↔ DATE

| フィールド | GEDCOM 7.0 `DATE` 表現 | 備考 |
|---|---|---|
| `original` | `DATE` 配下の `PHRASE`(自由記述の原文) | 和暦原文(例: 「昭和10年頃」)はここへ退避し、構造化日付とあわせて保持する。**5.5.1 には PHRASE が無いため、兄弟 `NOTE`「元の表記: …」へ退避し、インポート時に優先復元する** |
| `date` / `date2` | `DATE` の暦日値(`GREGORIAN`カレンダー) | 年のみ・年月のみの部分日付はGEDCOMの部分日付表記(例: `1935`、`OCT 1935`)に対応 |
| `qualifier: 'exact'` | 修飾子なし | — |
| `qualifier: 'about'` | `ABT` | — |
| `qualifier: 'before'` | `BEF` | — |
| `qualifier: 'after'` | `AFT` | — |
| `qualifier: 'between'` | `BET <date> AND <date2>` | `date`/`date2` の両方を使用。`date2` 欠落データは exact へ降格+警告(JSONインポートの修復と同じ扱い) |

## TreeDocument

| フィールド | GEDCOM 7.0タグ | 備考 |
|---|---|---|
| `schemaVersion` | (対応なし、内部管理のみ) | エクスポートには含めない。インポート時は現行値を採番 |
| `id` | (対応なし、内部管理のみ) | 同上 |
| `title` | `HEAD` 配下の独自拡張 `_TREE_TITLE` | GEDCOM 7.0の`HEAD`に家系図タイトル専用タグはないため拡張タグへ退避 |
| `updatedAt` | `HEAD` の `DATE`(UTC・大文字月名) | 両バージョンで出力する |
| `persons` | `INDI` レコード群 | — |
| `families` | `FAM` レコード群 | — |

## ヘッダ・シリアライズ規約

- **5.5.1 の必須要素**: `HEAD` に `SOUR KAKEIZUCHO`(+`NAME 家系図帖`)・`SUBM @U1@`・`GEDC` 配下 `FORM LINEAGE-LINKED` を出力し、`0 @U1@ SUBM` レコードを併せて出力する(規格の必須構造。厳格な取込器対策)。
- **7.0 の SCHMA**: 使用する独自拡張タグ(`_KANA_SURN`/`_KANA_GIVN`/`_FAM_KIND`/`_BIRTH_ORDER`/`_TREE_TITLE`/`_SPOUSE_ROLE_UNKNOWN`)を `HEAD` の `SCHMA` で宣言する。
- **行分割**: 7.0 は CONC を使わない(7.0で廃止されたため。改行は CONT のみ)。5.5.1 の CONC 分割は NOTE 系の長文タグに限定し、サロゲートペア境界・行末空白を避けて分割する。
- **エスケープ**: 値先頭の `@` は `@@` へ(パース時に復号)。値中の `\r` は `\n` へ正規化してから行分割する(行構造注入の防止)。
- **文字コード判定**(インポート): UTF-8(BOM有無)/UTF-16/Shift_JIS を自動判定。Shift_JIS として読めた場合も必ず警告を出し、結果に U+FFFD が含まれる・`0 HEAD` 行が無い場合は失敗として扱う。ANSEL は先頭領域の `CHAR` 宣言で検出して中断する。

## 拡張タグの命名規則

GEDCOM標準タグへ直接対応しない日本固有情報は、GEDCOM仕様のアンダースコア接頭辞規約に従い `_` 始まりの独自拡張タグとして退避する(例: `_KANA_SURN`, `_FAM_KIND`, `_TREE_TITLE`)。将来のインポート時、未知の `_` タグは無視するのではなく、対応するモデルフィールドへ読み戻せるよう実装する。

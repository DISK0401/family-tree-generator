# json-import-export

## Purpose

アプリネイティブJSON形式(既存の `TreeDocument.schemaVersion` を用いた検証)によるロスレスなエクスポート/インポート。GEDCOMでは表現しきれない内部情報の完全バックアップ手段。対象となる内部データモデルは既存の `family-data-model` ケーパビリティ(`TreeDocument`)である。

## Requirements

### Requirement: クライアント完結の処理(プライバシー)
JSONのインポート・エクスポート処理は、すべてユーザーのブラウザ内で完結しなければならない(MUST)。処理の過程で家系図データ・ファイル内容を含むいかなる情報もサーバ・外部APIへ送信してはならない(MUST NOT)。

#### Scenario: インポート/エクスポート時にネットワーク送信が発生しない
- **WHEN** JSONファイルのインポートおよびエクスポートを実行し、ブラウザ開発者ツールのNetworkタブを確認する
- **THEN** 自ホストの静的アセット取得以外のネットワーク通信が発生しない

### Requirement: ネイティブJSONエクスポート
システムは `TreeDocument` をネイティブJSON形式でエクスポートできなければならない(SHALL)。出力は `TreeDocument` が持つ `schemaVersion`・全人物(`persons`)・全家族(`families`)を含み、内部データモデルの全情報をロスレスに直列化しなければならない(SHALL)。エクスポートするファイル名には、書き出し日時を表す14桁のタイムスタンプ(`yyyyMMddHHmmss`)を含めなければならない(SHALL)。これにより同一形式で複数回エクスポートしても、既存のファイルが暗黙に上書きされてはならない(MUST NOT)。

#### Scenario: 全情報を含むエクスポート
- **GIVEN** ふりがな・メモ・和暦由来のFuzzyDate(原文を含む)を含む `TreeDocument`
- **WHEN** JSON形式でエクスポートする
- **THEN** `schemaVersion` を含むJSONファイルがダウンロードされ、ふりがな・メモ・日付原文がすべて含まれる

#### Scenario: エクスポートファイル名にタイムスタンプが付与される
- **WHEN** JSON形式でエクスポートする
- **THEN** ダウンロードされるファイル名は `family-tree-{yyyyMMddHHmmss}.json` の形式になる

#### Scenario: 短時間に複数回エクスポートしてもファイル名が重複しない
- **WHEN** JSON形式で1分以内に2回連続してエクスポートする
- **THEN** それぞれ異なるタイムスタンプを含むファイル名でダウンロードされ、片方が暗黙に上書きされない

### Requirement: ネイティブJSONインポートとスキーマ検証
システムはネイティブJSONファイルをインポートし、スキーマ検証に合格した場合のみ `TreeDocument` として復元しなければならない(SHALL)。スキーマ不一致・`schemaVersion` 欠落・未知の `schemaVersion` の場合はインポートを中断し、理由を平易な日本語で表示し、既存データを変更してはならない(MUST NOT)。

#### Scenario: 正常なJSONのインポート
- **WHEN** 本システムがエクスポートしたJSONファイルをインポートする
- **THEN** スキーマ検証に合格し、`TreeDocument` として復元される

#### Scenario: スキーマ不一致の拒否
- **WHEN** 必須フィールドが欠けた・型が不正なJSONファイルをインポートしようとする
- **THEN** インポートは中断され、どの項目が不正かが平易な日本語で表示され、既存データは変更されない

#### Scenario: 未知のschemaVersionの拒否
- **WHEN** 現在の実装が知らない `schemaVersion`(例: 999)のJSONファイルをインポートしようとする
- **THEN** インポートは中断され、「新しいバージョンのアプリでエクスポートされた可能性がある」旨が表示される

### Requirement: ラウンドトリップの完全性
本システムでエクスポートしたJSONを再インポートした場合、`TreeDocument` は元と等価に復元されなければならない(SHALL)。GEDCOM形式では表現できない情報(事実婚の関係種別、複数配偶者、和暦の原文、続柄「不明」等)も、JSONでは欠落なく復元されなければならない(SHALL)。

#### Scenario: エクスポート→インポートの等価復元
- **GIVEN** 養子縁組・再婚・事実婚・和暦由来のFuzzyDateを含む複雑な `TreeDocument`
- **WHEN** JSON形式でエクスポートし、そのファイルを再インポートする
- **THEN** 復元された `TreeDocument` は元のデータと等価である(全人物・全家族・全属性が一致する)

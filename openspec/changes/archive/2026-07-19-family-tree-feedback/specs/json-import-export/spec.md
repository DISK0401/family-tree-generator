## MODIFIED Requirements

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

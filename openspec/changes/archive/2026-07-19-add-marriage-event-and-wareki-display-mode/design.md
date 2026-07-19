## Context

`Family.events`(`FamilyEventType = 'marriage' | 'divorce'`)は既にデータモデル・GEDCOMマッピングとも実装済みだが、`tree-editor`には家族単位のイベントを編集するUIがない。同様に `src/domain/wareki.ts` の和暦⇄西暦変換ロジックは実装済みで入力側(`WarekiDateInput`)にも組み込まれているが、`display-settings`(`formatDateForDisplay`)はカード表示を常に西暦に固定している。

家系図キャンバス(family-chart)のカードデータ(`FamilyChartCardData`)は現状 `birthYear`/`deathYear`/`birthDate`/`deathDate` のみを持ち、婚姻・離婚イベントを表示する項目がない。`toFamilyChartData` 系の変換関数(`src/rendering/to-family-chart-data.ts`)は婚姻年を配偶者の並び順(`sortSpousesByMarriageDate`)には使うが、カード上への描画は行っていない。

家族の編集操作は `src/domain/commands.ts` に集約されており、`addFamilyEvent`(末尾追記)・`updateFamily`(部分パッチ)が既に存在する。個人編集は `PersonEditForm`(確定ボタン+Enterキー+未確定変更の離脱確認、`tree-editor` spec)、続柄編集は `PedigreeEditor`(即時反映、確認ダイアログなし)という2つの異なる編集パターンが `PersonPanel` 内に共存している。

データフロー: 本変更は完全にクライアント側(ブラウザ)で完結する。新しいネットワークリクエスト・外部API呼び出し・Supabaseアクセスは発生しない(`local-autosave` spec の「外部送信ゼロ」を維持)。

## Goals / Non-Goals

**Goals:**
- 家族(婚姻単位)の婚姻日・離婚日(+場所)を、既存の人物編集パネルと一貫した体験で編集できるようにする
- 表示設定に和暦表示モードを追加し、既存の日付粒度設定と組み合わせてカード上の生年月日・没年月日を和暦表示できるようにする
- 人物カードに表示する項目(姓・名・ふりがな・生没日・生没地・年齢・性別アイコン)を利用者が個別に選択できるようにする
- 配偶者を結ぶ婚姻線に婚姻日をラベル表示できるようにする(表示設定でオン/オフ可能)
- 既存のデータモデル・GEDCOMマッピング・エクスポート内容には一切影響を与えない

**Non-Goals:**
- 同一家族内で3件目以降の婚姻・離婚イベント(2度目の復縁等)をUIから新規追加すること。GEDCOMインポート等で既に複数件のイベントを持つFamilyについては、UIは各種別の最初の1件のみを編集対象とし、それ以外のイベントはデータとして保持されたまま(エクスポートにも残る)UI上は編集対象にしない
- 埋葬(`BURI`)等、婚姻・離婚以外のGEDCOMライフサイクルイベントの追加(プロポーザルで見送り済み)
- 記念日通知機能(プロポーザルで見送り済み)

## Decisions

### D1. 家族イベント編集は「即時反映」パターンを採用する(PedigreeEditor踏襲)
`PersonEditForm` は確定ボタン+未確定変更の離脱確認という重量パターンを持つが、これは自由記述の氏名・メモ等、誤操作時の被害が大きいフィールド群を想定した設計(`tree-editor` spec「人物情報の編集パネル」)。婚姻・離婚イベントは `PedigreeEditor` の続柄編集と同様、選択式・少数フィールドの単純な更新であり、`PersonPanel` 内の別パネルとして独立させる。既存の `PedigreeEditor`(即時 `apply` 呼び出し、確認ダイアログなし)と同じUXパターンを踏襲し、`PersonEditForm` のダーティ追跡・離脱確認の対象には含めない。
- **代替案**: `PersonEditForm` に婚姻日フィールドを統合する案も検討したが、婚姻は人物ではなく家族(複数配偶者の場合は家族ごとに複数件)に属する情報であり、人物単位の確定フォームに混在させると「どの配偶者との婚姻か」の対応が分かりにくくなるため見送った。

### D2. 新規コンポーネント `FamilyEventEditor` を `PedigreeEditor` と同じ階層に追加する
選択中人物が配偶者として属する `Family`(`family.spouseIds.includes(personId)`)ごとに、婚姻日・離婚日(各+場所)を1組ずつ表示・編集する。`WarekiDateInput` を再利用し、`PersonEditForm` の生年月日/没年月日と同じ `fieldset` パターンで配置する。`PersonPanel` 内で `PedigreeEditor` の直後に配置する。

### D3. ドメインコマンドに `setFamilyEvent` を追加する
`events: LifeEvent<FamilyEventType>[]` から指定種別(`marriage`/`divorce`)の最初の1件を検索し、置換・追加・削除(値が`undefined`の場合)を行う純関数を `commands.ts` に追加する。既存の `addFamilyEvent`(常に末尾追記、復縁等の複数件を意図的に扱うAPI)とは役割を分け、UIからの単純な「その家族の婚姻日を設定/更新/削除する」操作にはこの新コマンドを使う。それ以外(GEDCOMインポート等で複数件を投入する経路)は引き続き `addFamilyEvent` を使う。
```ts
function setFamilyEvent(
  doc: TreeDocument,
  familyId: FamilyId,
  type: FamilyEventType,
  event: LifeEvent<FamilyEventType> | undefined,
): TreeDocument
```

### D4. 和暦表示は「実データ精度→表示粒度→和暦変換」の順で丸めてから整形する
`formatDateForDisplay` に `calendarMode: 'gregorian' | 'wareki'` を追加する。既存の粒度丸め処理(実データ精度と指定粒度のうち粗い方を採用)を先に適用して `CalendarDate` を確定させ、`calendarMode === 'wareki'` の場合のみ、その丸め済み `CalendarDate` を `gregorianToWareki` に渡して `formatWareki` で整形する。これにより粒度設定と和暦設定が独立した直交する設定として組み合わせられる(例: 「年のみ」+「和暦」→「昭和39年」)。
- **代替案**: 和暦変換を先に行ってから粒度で丸める順序も検討したが、`gregorianToWareki` は年またぎ(改元)の判定に月日を使うため、丸め後の(月日が欠落した)日付を渡すと改元年の判定精度が落ちる。丸めは西暦の年単位でも一意に定まるため、変換順序を「粒度丸め→和暦変換」に固定する。

### D5. 明治より前の日付は和暦表示モードでも西暦表示にフォールバックする
`ERA_TABLE` は明治(1868年)までしか定義されていない。`gregorianToWareki` が `null` を返す場合(明治より前)、和暦表示モードでも `formatGregorian` の結果をそのまま表示する。エラー表示やユーザー通知は行わない(データの正確性には影響しない、表示のみの妥当なフォールバックのため)。

### D6. 婚姻・離婚日の「表示」は編集パネル内の入力欄の即時変換表示にとどめ、`calendarMode` の対象には含めない
`WarekiDateInput` は入力時に和暦⇄西暦の両方を常に表示する(既存の生年月日/没年月日編集と同じ挙動)。これは `calendarMode` 設定に関わらず常に両方を見せる独立の機能であり、今回追加する婚姻・離婚日編集もこの挙動をそのまま引き継ぐ。`calendarMode` はカード表示(`formatDateForDisplay` 経由、現状は生年月日・没年月日のみ)にのみ適用される。将来婚姻日をカードに表示するようになった場合は同じ関数を再利用できる設計とする。

### D7. `DisplaySettingsControl` に和暦表示のトグルを追加する
既存の生年月日・没年月日の粒度セレクトと同じ見た目・並びで、「表示形式」として「西暦」「和暦」を選べるセレクトを追加する。`display-settings-store.ts` に `calendarMode` の状態と `setCalendarMode` を追加し、既存の `birthDateGranularity`/`deathDateGranularity` と同じ永続化(`saveDisplaySettings`)経路に乗せる。

### D8. カード表示項目は全項目を独立したbooleanのフラグ集合として持つ
`DisplaySettings` に `visibleCardFields: { surname, given, furigana, birthDate, deathDate, birthPlace, deathPlace, age, genderIcon }`(すべてboolean)を追加する。姓・名・生年月日・没年月日は「表示するかどうか」を今回新設し、既存の日付粒度設定(年のみ/年月まで/年月日まで)とは独立した掛け算(粒度は「表示する場合にどこまで詳しく出すか」を、新設のフラグは「そもそも表示するか」を担当)にする。デフォルトは現状のカード表示と完全に一致させる(`surname/given/birthDate/deathDate/age/genderIcon: true`、`furigana/birthPlace/deathPlace: false`)。`FamilyChartCardData` にふりがな・出生地/没地を追加し、`FamilyTreeCanvas` のカードHTML生成(D4/D7と同じ `useRef` 経由の即時反映パターン)で各フラグに応じて出し分ける。

姓・名の表示は、現状の「両方揃っていれば2行、どちらか一方のみなら1行」というレイアウト分岐(`nameHtml`)を、「表示対象かつデータが存在する」方だけを対象に再構成する。姓・名を両方非表示にした場合(データはあってもユーザーが意図的に隠した場合)、名前欄は空になる(既存の「未入力時のフォールバック文言」は出さない。データはあるのに未入力と誤解させないため)。
- **代替案**: 姓・名の表示可否を「フルネーム表示/イニシャルのみ」のようなプリセットにする案も検討したが、要望が「個別に選べる」ことなので見送った。

### D9. 婚姻線ラベルはfamily-chart組み込みの`setLinkSpouseText`を使う
当初はスパイクで検証した「`chart.setAfterUpdate`内で婚姻線pathの中点を`getTotalLength()`/`getPointAtLength()`で計算し、`<text>`要素を手動挿入する」方式を採用したが、実装後の複雑な家系図(3世代・隠れバッジあり)での動作確認で、ラベルが実際の線から大きくズレて表示される不具合が発覚した。原因は、`setAfterUpdate`がD3のtransition(`setTransitionTime`、既定700ms)開始直後に同期的に呼ばれるため、`getPointAtLength()`がtransition完了後の最終位置ではなく古い(または遷移前の)path形状を読んでしまうこと。小さな家系図(初期状態に近い1組の配偶者のみ)ではズレが目立たなかったため、当初のスパイクでは発見できなかった。

family-chartには婚姻線へテキストを描画する組み込み機能`chart.setLinkSpouseText((sp1, sp2) => string)`が存在し(`node_modules/family-chart/dist/family-chart.esm.js`の`linkSpouseText`関数、`Chart.setOnUpdate`内で`view()`と同じタイミング・同じtransition設定で呼ばれる)、ツリーレイアウト計算そのものが使う座標(`sp1.y`等)を直接使って位置決めするため、DOM描画後にSVG座標を逆算する必要がなく、transitionのタイミング問題が原理的に発生しない。これに置き換えた(family-chart本体の改修は依然として不要)。

コールバック関数は`showMarriageDateOnLinkRef`/`calendarModeRef`/`documentRef`を参照し、オフの場合や婚姻日未設定の場合は空文字列を返す(空文字列は「テキストなし」として扱われ、視覚的に何も表示されない)。ライブラリ側は`.link-text text`要素に`fill: #fff`等をJSのinline styleとして設定するため、CSSでの上書きには`!important`が必要(`FamilyTreeCanvas.css`参照)。

ラベル内容はそのFamilyの最初の婚姻イベント(`events.find(e=>e.type==='marriage')`)の日付。粒度設定は新設せず常にフル精度(判明している範囲)で表示し、`calendarMode`には追従する。離婚日はラベルに含めない(離婚日はサイドパネルのFamilyEventEditorで確認する)。

表示のオン/オフは `DisplaySettings` に `visibleCardFields` とは別の新フィールド `showMarriageDateOnLink: boolean`(デフォルト`false`、現状の見た目を維持)として持たせる。`visibleCardFields`は人物カード内の項目という意味づけのフラグ集合のため、線に対するラベルはあえて型を分ける。`DisplaySettingsControl`の「表示する項目」チェックボックス群に「婚姻日(線)」として並べる(UI上は同じセクションに見えるが、データ型・永続化キーは別)。

離婚済みのFamily(離婚イベントがある)でも、婚姻イベントが記録されている限り婚姻線に婚姻日ラベルを表示し続ける(婚姻していた事実の記録として扱う)。
- **代替案**: 配偶者カードそれぞれに婚姻日を追記する案も検討したが、2枚のカードに同じ日付が重複して載り、かつ「誰との婚姻か」が視覚的に分かりにくいため見送った。

## Risks / Trade-offs

- [リスク] `setFamilyEvent` が最初の1件のみを対象とするため、GEDCOMインポートで復縁(婚姻→離婚→婚姻)済みのFamilyをUIで編集すると、意図せず2件目以降が編集対象から外れて見える可能性がある → 緩和策: 3件目以降が存在する場合は「他に◯件のイベントがあります(このUIでは編集できません)」という注記をFamilyEventEditorに表示し、データが失われていないことを明示する
- [リスク] 和暦表示モードで明治より前の日付が西暦表示のままになるのはユーザーにとって不可解に見える可能性がある → 緩和策: 該当日付の近傍に「(和暦非対応の年代)」等の小さな注記を表示するか、最小実装では無表記のまま許容する(データ自体は正しいため実害はない)。実装時に注記の要否を判断する
- [リスク] 姓・名の両方を非表示にすると、カード上でその人物を識別する手がかりが性別アイコンしか残らず、家系図として機能しなくなる可能性がある → 緩和策: UIを止めはしない(利用者の意図的な選択を尊重する)が、`DisplaySettingsControl` の説明文で影響を明示する
- [リスク] 複数の婚姻線が近接する家系図(狭い間隔での再婚・多世代密集等)では、ラベル同士が重なって読みにくくなる可能性がある → 今回は許容し、必要になれば別changeでレイアウト調整(フォント縮小・省略・オフセット等)を検討する

## Migration Plan

- データモデル(`SCHEMA_VERSION`)への変更はなく、マイグレーション処理は不要
- `DisplaySettings` への `calendarMode` 追加は、既存の防御的パース(`loadDisplaySettings`)にデフォルト値 `'gregorian'`(現状の表示と同一)へのフォールバックを持たせることで、旧バージョンで保存された設定(`calendarMode` キーが存在しない)も安全に読み込める
- `visibleCardFields` も同様に、キー単位でのフォールバック(未保存のキーは現状の見た目と一致するデフォルト値を補う)を持たせ、旧バージョンで保存された設定を安全に読み込める
- デプロイは既存の `develop`/`main` 自動デプロイフロー(`cloudflare-deploy`)にそのまま乗る。問題発生時は `wrangler rollback` または直前コミットへのrevertで復旧でき、データ側のロールバック手順は不要

## Open Questions

- 婚姻線ラベルが密集した場合の重なり対策(将来検討。D9のRisks参照)
- 3件目以降の婚姻・離婚イベントに対する編集導線(復縁の2回目以降)を将来サポートする場合、`FamilyEventEditor` をリスト編集UIへ拡張する必要がある。今回は据え置き

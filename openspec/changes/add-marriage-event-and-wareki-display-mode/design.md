## Context

`Family.events`(`FamilyEventType = 'marriage' | 'divorce'`)は既にデータモデル・GEDCOMマッピングとも実装済みだが、`tree-editor`には家族単位のイベントを編集するUIがない。同様に `src/domain/wareki.ts` の和暦⇄西暦変換ロジックは実装済みで入力側(`WarekiDateInput`)にも組み込まれているが、`display-settings`(`formatDateForDisplay`)はカード表示を常に西暦に固定している。

家系図キャンバス(family-chart)のカードデータ(`FamilyChartCardData`)は現状 `birthYear`/`deathYear`/`birthDate`/`deathDate` のみを持ち、婚姻・離婚イベントを表示する項目がない。`toFamilyChartData` 系の変換関数(`src/rendering/to-family-chart-data.ts`)は婚姻年を配偶者の並び順(`sortSpousesByMarriageDate`)には使うが、カード上への描画は行っていない。

家族の編集操作は `src/domain/commands.ts` に集約されており、`addFamilyEvent`(末尾追記)・`updateFamily`(部分パッチ)が既に存在する。個人編集は `PersonEditForm`(確定ボタン+Enterキー+未確定変更の離脱確認、`tree-editor` spec)、続柄編集は `PedigreeEditor`(即時反映、確認ダイアログなし)という2つの異なる編集パターンが `PersonPanel` 内に共存している。

データフロー: 本変更は完全にクライアント側(ブラウザ)で完結する。新しいネットワークリクエスト・外部API呼び出し・Supabaseアクセスは発生しない(`local-autosave` spec の「外部送信ゼロ」を維持)。

## Goals / Non-Goals

**Goals:**
- 家族(婚姻単位)の婚姻日・離婚日(+場所)を、既存の人物編集パネルと一貫した体験で編集できるようにする
- 表示設定に和暦表示モードを追加し、既存の日付粒度設定と組み合わせてカード上の生年月日・没年月日を和暦表示できるようにする
- 既存のデータモデル・GEDCOMマッピング・エクスポート内容には一切影響を与えない

**Non-Goals:**
- 婚姻・離婚日を家系図キャンバスのカード上に表示すること(`FamilyChartCardData` の拡張)。現状カードは生没年のみを表示しており、婚姻イベントの描画面(配偶者を結ぶ辺のラベル等)を新設するのは家系図レイアウトへの影響が大きく、今回の「軽微な追加」の範囲を超える
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

## Risks / Trade-offs

- [リスク] `setFamilyEvent` が最初の1件のみを対象とするため、GEDCOMインポートで復縁(婚姻→離婚→婚姻)済みのFamilyをUIで編集すると、意図せず2件目以降が編集対象から外れて見える可能性がある → 緩和策: 3件目以降が存在する場合は「他に◯件のイベントがあります(このUIでは編集できません)」という注記をFamilyEventEditorに表示し、データが失われていないことを明示する
- [リスク] 和暦表示モードで明治より前の日付が西暦表示のままになるのはユーザーにとって不可解に見える可能性がある → 緩和策: 該当日付の近傍に「(和暦非対応の年代)」等の小さな注記を表示するか、最小実装では無表記のまま許容する(データ自体は正しいため実害はない)。実装時に注記の要否を判断する
- [トレードオフ] 婚姻日をキャンバスカードに表示しないため、和暦表示モードの効果は生年月日・没年月日にしか現れず、「結婚記念日を教えてほしい」という体験の一部(カード上でひと目で分かる)は満たさない → 今回はNon-Goalとして明示し、必要になれば別changeでカード表示を検討する

## Migration Plan

- データモデル(`SCHEMA_VERSION`)への変更はなく、マイグレーション処理は不要
- `DisplaySettings` への `calendarMode` 追加は、既存の防御的パース(`loadDisplaySettings`)にデフォルト値 `'gregorian'`(現状の表示と同一)へのフォールバックを持たせることで、旧バージョンで保存された設定(`calendarMode` キーが存在しない)も安全に読み込める
- デプロイは既存の `develop`/`main` 自動デプロイフロー(`cloudflare-deploy`)にそのまま乗る。問題発生時は `wrangler rollback` または直前コミットへのrevertで復旧でき、データ側のロールバック手順は不要

## Open Questions

- 婚姻日をキャンバスカード上にも表示すべきか(Non-Goalとしたが、ユーザーからの要望が強ければ別changeで検討)
- 3件目以降の婚姻・離婚イベントに対する編集導線(復縁の2回目以降)を将来サポートする場合、`FamilyEventEditor` をリスト編集UIへ拡張する必要がある。今回は据え置き

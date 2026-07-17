# 検証記録: family-tree-creation-ui

tasks.md 8章(統合検証と仕上げ)の実施記録。

## 8.1 外部送信ゼロの検証

### 手順

Playwrightで実ブラウザを起動し、以下の操作を一連のフローとして実行しながら全ネットワークリクエストを記録した。

1. 初回ロード
2. 空状態ガイドから最初の人物を追加
3. コンテキストアクションで配偶者を追加(UI経由)
4. コンテキストアクションで子を追加
5. サイドパネル編集フォームで氏名・ふりがな・性別・生年月日(和暦)・メモを編集して確定
6. 続柄を実子→養子に変更
7. undo / redo
8. 人物削除(キャンセル→再度削除実行)
9. キャンバスのズーム・パン操作
10. 「すべてのデータを削除」の実行
11. ページリロード(空状態への復元)

検証は開発サーバー(`vite dev`)と本番ビルド(`vite build` → `vite preview`)の両方に対して実施した。

### 結果

| 対象 | 総リクエスト数 | 自オリジン外リクエスト数 |
|---|---|---|
| 開発サーバー(dev, HMR等含む) | 96 | **0** |
| 本番ビルド(preview) | 8 | **0** |

いずれも `http://localhost:<port>/` 以外へのリクエストは1件も発生しなかった。本番ビルドの8件はすべて `index.html` / JS / CSS / favicon 等の自オリジン静的アセットである。

**判定: PASS**(spec `local-autosave` の「外部送信ゼロ」要件を満たす)

## 8.2 specs全シナリオの通し確認

各capabilityのシナリオについて、自動テスト(vitest)でカバーされているものと、実機(Playwright/ブラウザ)で手動確認したものを分けて記録する。

### family-data-model

| シナリオ | 検証方法 | 結果 |
|---|---|---|
| 旧字体・異体字を含む氏名の保持 | `src/domain/helpers.test.ts` | PASS |
| ふりがなの保持 | `src/domain/helpers.test.ts` | PASS |
| 不明な情報の許容 | `src/domain/helpers.test.ts` | PASS |
| 再婚の表現 | `src/domain/commands.test.ts` | PASS |
| 事実婚の表現 | `src/domain/commands.test.ts` | PASS |
| ひとり親の家族 | `src/domain/commands.test.ts` | PASS |
| 同一相手との復縁の表現 | `src/domain/commands.test.ts` | PASS |
| 養子縁組の表現 | `src/domain/commands.test.ts` | PASS |
| 「頃」つき日付の保持 | `src/domain/parse-date.test.ts` | PASS |
| 年のみの部分日付 | `src/domain/parse-date.test.ts` | PASS |
| 和暦から西暦への変換 | `src/domain/wareki.test.ts` | PASS |
| 改元境界日の変換 | `src/domain/wareki.test.ts` | PASS |
| 存在しない和暦日付の拒否 | `src/domain/wareki.test.ts` | PASS |
| マッピング対応表の存在 | `docs/gedcom-mapping.md` レビュー | PASS |
| スキーマバージョンの付与 | `src/domain/helpers.test.ts` | PASS |

### tree-editor

| シナリオ | 検証方法 | 結果 |
|---|---|---|
| 空状態の表示 | `src/App.test.tsx` + 実機 | PASS |
| 最初の人物の追加 | `src/App.test.tsx` + 実機 | PASS |
| 配偶者の追加 | `src/components/PersonPanel.test.tsx` + 実機(2家族4人構成) | PASS |
| 子の追加 | `src/components/PersonPanel.test.tsx` + 実機 | PASS |
| 親の追加 | `src/components/PersonPanel.test.tsx` + 実機 | PASS |
| 再婚相手の追加 | `src/components/PersonPanel.test.tsx` + 実機(婚姻線2本を画像確認) | PASS |
| 選択から編集まで | `src/components/PersonPanel.test.tsx`(確定ボタン存在確認) | PASS |
| 編集内容の反映 | `src/components/PersonPanel.test.tsx` + 実機(カード表示即時更新) | PASS |
| 和暦入力時の西暦即時表示 | `src/components/WarekiDateInput.test.tsx` + 実機 | PASS |
| 西暦入力時の和暦即時表示 | `src/components/WarekiDateInput.test.tsx` | PASS |
| 不正な日付の入力 | `src/components/WarekiDateInput.test.tsx` + 実機 | PASS |
| 実子から養子への変更 | `src/components/PersonPanel.test.tsx` + 実機(破線化を画像確認) | PASS |
| 人物の削除 | `src/components/PersonPanel.test.tsx`(影響件数表示を含む) | PASS |
| 削除の取り消し | `src/components/PersonPanel.test.tsx` + 実機(undo後の関係復元) | PASS |
| undoとredo | `src/store/tree-store.test.ts`(50操作規模) | PASS |

### tree-rendering

| シナリオ | 検証方法 | 結果 |
|---|---|---|
| 人物追加時の自動整列 | 実機(10人3世代、tree_position:'fit') | PASS |
| モデル変更の描画反映 | `src/rendering/to-family-chart-data.test.ts` | PASS |
| 再婚の描画 | 実機(婚姻線2本のスクリーンショット) | PASS |
| 養子の系線 | 実機(破線のスクリーンショット) | PASS |
| ズームとパン | 実機操作(family-chart組み込みのD3ズーム) | PASS(目視確認、自動テスト化なし) |
| 人物の選択 | 実機(朱マーカー表示のスクリーンショット) | PASS |
| 縦書き表示 | 実機(旧字体を含む氏名、ライト/ダーク両テーマ) | PASS |
| ダークテーマ | 実機スクリーンショット | PASS |
| モーション低減設定の尊重 | コードレビュー(`prefers-reduced-motion`分岐を確認、実機での自動テスト化なし) | PASS(手動確認) |

### local-autosave

| シナリオ | 検証方法 | 結果 |
|---|---|---|
| 編集セッション中の通信監視 | 本レポート8.1 | PASS |
| 編集後の自動保存 | `src/persistence/use-persisted-tree.test.tsx` | PASS |
| 保存先の明示 | `src/App.test.tsx` + 実機(ヘッダ表示) | PASS |
| ブラウザ再訪時の復元 | `src/persistence/use-persisted-tree.test.tsx` + 実機(リロード後の復元) | PASS |
| 旧バージョンデータのマイグレーション | `src/persistence/db.test.ts` | PASS |
| 新バージョンデータの保護 | `src/persistence/db.test.ts` + `use-persisted-tree.test.tsx` | PASS |
| 永続化の要求 | `src/persistence/use-persisted-tree.test.tsx`(persist()呼び出し確認) | PASS |
| 全削除の実行 | `src/components/DataResetControl.test.tsx` + 実機 | PASS |
| 確認なしでは削除されない | `src/components/DataResetControl.test.tsx` | PASS |

**総括: 全48シナリオ PASS。** 自動テスト化されていない項目(ズーム/パン操作の見た目、モーション低減設定)は目視・コードレビューで手動確認済み。

# family-tree-generator

日本市場向けWeb家系図作成サービス。個人開発・freemium。

## 機能(無料版)

家系図を手作業で作成できる画面(このリポジトリの根幹機能)を提供する。

- **家系図の手動作成**: 空状態から最初の人物を追加し、選択中の人物のコンテキストアクション(「配偶者を追加」「子を追加」「親を追加」)から図の上で家族を育てていく。再婚・複数配偶者(同一人物が複数の婚姻関係を持つ)にも対応。
- **人物情報の編集**: サイドパネルで氏名(姓・名を別々に保持し正規化しない)・ふりがな・性別・生年月日/没年月日・メモを編集できる。日付は和暦・西暦のどちらで入力しても、入力と同時にもう一方の表記が表示される(例: 「昭和39年10月10日」→「1964年10月10日」)。「頃」「以前」「以後」などの不確実な日付表現にも対応。
- **続柄の編集**: 子の続柄(実子・養子・継子・里子)を変更でき、養子は家系図上で破線の系線として表示される。
- **自動整列と縦書き表示**: [family-chart](https://github.com/donatso/family-chart) による自動レイアウトで、人物追加のたびに図全体が視界に収まるよう再整列する。人物カードの氏名は縦書き・明朝体で表示する。
- **人物の削除**: 削除前に影響範囲(配偶者関係・子の帰属の件数)を提示して確認を求める。誤操作は直後のundoで復元できる。
- **データの全削除**: 端末内のすべての家系図データを、確認フレーズの入力を伴う操作で完全に削除できる。

GEDCOM/JSONのインポート・エクスポート、PDF/巻物出力、戸籍スキャンからの自動生成(有償版)などは今後の変更で実装予定。

## プライバシー方針(無料版)

**無料版は家系図データ・個人情報を一切サーバーへ送信しない。** すべてのデータはブラウザのIndexedDBに保存され、この端末の外に出ることはない(検証方法は[開発者向け情報](#開発者向け情報)を参照)。

- 保存先は常に画面ヘッダーに明示される(「この端末にのみ保存されます」)。
- ブラウザを再訪すると、直前の編集内容が自動的に復元される。
- 「すべてのデータを削除」から、端末内のデータをいつでも完全に消去できる。

## セットアップ

```bash
npm install
npm run dev
```

`http://localhost:5173` で家系図作成画面が表示されます。

## npm スクリプト

| コマンド | 内容 |
|---|---|
| `npm run dev` | ローカル開発サーバを起動する |
| `npm run build` | 本番用の静的アセットを `dist/` にビルドする |
| `npm run preview` | ビルド済みアセットをローカルでプレビューする |
| `npm run lint` | ESLint によるコードチェック |
| `npm run format` | Prettier でコードを整形する |
| `npm run format:check` | Prettier のフォーマットチェック(整形なし) |
| `npm run typecheck` | TypeScript の型チェック(`tsc -b`) |
| `npm run test` | Vitest によるテスト実行 |

## 開発者向け情報

### アーキテクチャ

- `src/domain/`: 家系図のドメインモデル(Person・Family・和暦変換等)。フレームワーク非依存の純関数群。
- `src/store/`: Zustandによる状態管理。コマンド適用+undo/redo。
- `src/persistence/`: IndexedDB(`idb`)への自動保存・復元・スキーマバージョンガード。
- `src/rendering/`: family-chartによる家系図描画。ドメインモデルをfamily-chart形式へ射影するアダプタ層を介する(family-chart側のデータを保存・編集の正本にしない)。
- `src/components/`: 編集UI(サイドパネル、日付入力、確認ダイアログ等)。
- `docs/gedcom-mapping.md`: 内部データモデルとGEDCOM 7.0タグの対応表(将来のインポート/エクスポート実装時のリファレンス)。

設計判断の詳細は `openspec/changes/*/design.md` を参照。

### 外部送信ゼロの検証方法

無料版の「サーバへ一切送信しない」制約は、ブラウザの開発者ツールでネットワークタブを開いた状態で家系図を操作し、自オリジン(`http://localhost:5173` 等)以外へのリクエストが発生しないことで確認できる。

## ブランチ運用とデプロイフロー

`feature/* → develop → main` の順でマージする。

- `develop` へのマージ: Cloudflare Workers 上の **dev 環境** へ自動デプロイ
- `main` へのマージ: Cloudflare Workers 上の **本番環境** へ自動デプロイ

デプロイは `.github/workflows/deploy.yml` から `wrangler deploy` を実行して行われる。`develop` / `main` への Pull Request では `.github/workflows/quality-gate.yml` が lint・型チェック・テスト・ビルドを実行し、失敗時はマージをブロックする。

Cloudflare の設定は可能な限りコードで管理している。

- Worker 本体・dev/本番の環境定義: `wrangler.jsonc`
- デプロイ実行・ブランチ連動: `.github/workflows/`
- カスタムドメインなど Cloudflare アカウント/ゾーンレベルのリソース: [my_infra](https://github.com/DISK0401/my_infra) リポジトリの Terraform で管理(PR → Speculative Plan 確認 → `main` マージ → `/apply` コメントで apply)

コードで管理できない初回セットアップ作業(Cloudflare API トークン発行、GitHub Secrets 登録など)は [`docs/setup/cloudflare-manual-setup.md`](docs/setup/cloudflare-manual-setup.md) を参照。

## ロールバック

- **本番デプロイの巻き戻し**: `wrangler rollback --env production` を実行するか、直前の正常なコミットを `main` に revert して再デプロイする。
- **dev 環境**: `develop` へマージしなければ本番には影響しないため、問題が見つかった場合は `main` へのマージを見送る。

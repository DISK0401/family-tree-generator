# family-tree-generator

日本市場向けWeb家系図作成サービス。

## セットアップ

```bash
npm install
npm run dev
```

`http://localhost:5173` でプレースホルダーページが表示されます。

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

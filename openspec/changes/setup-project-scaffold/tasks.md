# Tasks: setup-project-scaffold

## 1. プロジェクト雛形の作成

- [x] 1.1 Vite + React + TypeScript のプロジェクトを作成し、プレースホルダーページを表示する(既存の README / docs / openspec は保持)
  - 完了条件: `npm install` → `npm run dev` でプレースホルダーページがブラウザ表示される
- [x] 1.2 ESLint + Prettier を導入し、`npm run lint` / `npm run format:check` を整備する
  - 完了条件: 両コマンドが成功し、意図的な違反を混ぜると非ゼロ終了する
- [x] 1.3 `npm run typecheck`(tsc --noEmit)を整備する
  - 完了条件: 型エラーなしで成功し、意図的な型エラーで非ゼロ終了する
- [x] 1.4 Vitest を導入し、サンプルテストを 1 件以上作成する
  - 完了条件: `npm run test` がサンプルテスト成功で完了する
- [x] 1.5 プレースホルダーページが外部へデータ送信しないことを確認する(外部 API 呼び出し・アナリティクスなし)
  - 完了条件: 開発者ツールの Network タブで自ホストの静的アセット取得以外の通信がない

## 2. Cloudflare Workers 設定(IaC)

- [x] 2.1 wrangler を devDependencies に固定バージョンで追加し、`wrangler.jsonc` に static assets 構成と `env.dev` / `env.production`(別名 Worker)を定義する
  - 完了条件: `npx wrangler deploy --dry-run --env dev` / `--env production` が成功する
- [x] 2.2 dev 環境のみ noindex(X-Robots-Tag 相当)を付与する仕組みを実装する
  - 完了条件: dev のレスポンスに noindex 指示が含まれ、production 設定には含まれない(ユニットテストまたはデプロイ後のヘッダ確認)

## 3. CI/CD(GitHub Actions)

- [ ] 3.1 PR 品質ゲートのワークフローを作成する(develop / main 向け PR で lint・typecheck・test・build を実行)
  - 完了条件: PR 上で 4 チェックすべてが実行され、失敗時にステータスチェックが fail になる
- [ ] 3.2 デプロイワークフローを作成する(develop への push → `wrangler deploy --env dev`、main への push → `wrangler deploy --env production`。Secrets 欠如時は明示的にエラー)
  - 完了条件: ワークフロー定義が actionlint 等の構文検証を通り、ブランチ→環境のマッピングがレビューで確認できる

## 4. 手作業手順の文書化とユーザーへの実施依頼

- [ ] 4.1 IaC で管理できない手作業の手順書を `docs/setup/cloudflare-manual-setup.md` として作成する(①Cloudflare API トークン発行(Workers Scripts: Edit)、②GitHub Secrets 登録(`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`)、③workers.dev サブドメインの確認、④develop ブランチ作成とブランチ保護設定)
  - 完了条件: 手順書のみを見てユーザーが全手作業を実施できる粒度で記載されている
- [ ] 4.2 ユーザーに手作業(4.1 の①〜④)の実施を依頼し、完了を確認する
  - 完了条件: GitHub Secrets が登録され、develop ブランチとブランチ保護が GitHub 上に存在する

## 5. README 更新とデプロイ検証

- [ ] 5.1 README.md を更新する(セットアップ手順、npm スクリプト一覧、ブランチ運用 feature → develop → main、デプロイフロー、ロールバック手順、手順書へのリンク)
  - 完了条件: README の記載のみで環境構築から dev デプロイ・ロールバックまでの流れが辿れる
- [ ] 5.2 デプロイをエンドツーエンドで検証する(develop へのマージで dev 環境、main へのマージで本番環境が更新されること)
  - 完了条件: dev / 本番それぞれの workers.dev URL でプレースホルダーページが表示され、dev のみ noindex ヘッダが付与されている

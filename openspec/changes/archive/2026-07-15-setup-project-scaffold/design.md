# Design: setup-project-scaffold

## Context

- リポジトリは現在 README と調査ドキュメントのみで、アプリケーションコード・ビルド基盤・デプロイ基盤が存在しない。
- ホスティング先は Cloudflare Workers(static assets)と決定済み(openspec/config.yaml)。
- Cloudflare のアカウント/ゾーンレベルのリソースは my_infra リポジトリの Terraform Cloud(ワークスペース `personal-cloudflare`、VCS 駆動)で管理されており、「PR で Speculative Plan 確認 → main マージ → `/apply` コメントで apply」が既存の運用ルール。
- ユーザー方針: **Cloudflare は可能な限り IaC で管理する。IaC で不可能な部分のみ手作業とし、その場合は手順を明示してユーザーに指示する。**

## Goals / Non-Goals

**Goals:**

- TypeScript / React / Vite の雛形を作成し、ローカルで開発・検証・ビルドができる状態にする。
- `develop` マージ → dev 環境、`main` マージ → 本番環境、という Cloudflare への自動デプロイを構築する。
- Cloudflare 関連の設定を可能な限りコード(IaC)で管理し、手作業が必要な箇所を明確に列挙してユーザーに指示する。

**Non-Goals:**

- 家系図編集などのユーザー向け機能の実装(雛形はプレースホルダーページまで)。
- カスタムドメインの割り当て(初期は `*.workers.dev` で運用。ドメイン決定後に別変更として my_infra 経由で実施)。
- 有償版バックエンド(Supabase / Stripe / Gemini)の構築。
- family-chart 等の家系図描画ライブラリの導入(最初の機能変更で行う)。

## Decisions

### D1: デプロイ方式は GitHub Actions + wrangler(Workers Builds は使わない)

- **採用**: `.github/workflows/` の GitHub Actions から `wrangler deploy` を実行する。
- **理由**: ワークフロー定義・デプロイ条件がすべてリポジトリ内のコードとして管理でき、IaC 方針に合致する。ブランチ→環境のマッピングも YAML 上で明示できる。
- **代替案**: Cloudflare Workers Builds(ダッシュボードでの Git 連携)。設定がダッシュボード上の手作業になり、コード管理できないため不採用。

### D2: dev / 本番は wrangler の environment で分離した 2 つの Worker

- **採用**: `wrangler.jsonc` に `env.dev` と `env.production` を定義し、別名の Worker(例: `family-tree-generator-dev` / `family-tree-generator`)としてデプロイする。URL は `*.workers.dev` のサブドメインで分離される。
- **理由**: 1 ファイルで両環境を宣言的に管理でき、環境差分(env vars 等)が明示される。
- **代替案**: 別リポジトリ / 別設定ファイルでの分離。管理コスト増のため不採用。

### D3: Cloudflare リソースの IaC 管理の内訳と手作業の境界

| 対象 | 管理方法 |
|---|---|
| Worker 本体・静的アセット・環境定義 | `wrangler.jsonc`(本リポジトリ。コードとして宣言的に管理) |
| デプロイ実行・ブランチ連動 | GitHub Actions(本リポジトリ) |
| ゾーンレベルのリソース(将来のカスタムドメイン DNS、Cloudflare Access 等) | my_infra の Terraform(既存の PR → `/apply` フロー) |
| **IaC 不可能 → 手作業(ユーザーに指示)** | 下記「手作業一覧」参照 |

**手作業一覧(実装タスクで手順書として明示し、ユーザーに実施を依頼する):**

1. **Cloudflare API トークンの発行**: デプロイ用トークン(権限: Account / Workers Scripts: Edit)。トークン発行は Cloudflare ダッシュボードでの手作業でしか行えない。
2. **GitHub Secrets の登録**: `CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` を family-tree-generator リポジトリの Actions Secrets に登録。
3. **workers.dev サブドメインの確認**: アカウントで workers.dev サブドメインが未設定の場合、ダッシュボードで設定(アカウント初回のみ)。
4. **`develop` ブランチの作成とブランチ保護**: GitHub 上での `develop` ブランチ作成、および `main` / `develop` への直接 push 禁止・PR 必須のブランチ保護設定。

### D4: dev 環境のアクセス制限は初期は行わない(検索エンジン除外のみ)

- **採用**: dev 環境は当面 `*.workers.dev` で公開のままとし、`X-Robots-Tag: noindex` 相当の対応(dev のみ)で検索エンジンから除外する。
- **理由**: 雛形段階では個人情報・秘匿情報を一切扱わないため公開リスクが小さい。Cloudflare Access による制限はゾーン配下のホスト名が前提となるため、カスタムドメイン導入時(別変更)に my_infra の Terraform で追加するのが自然。
- **代替案**: 今すぐ Cloudflare Access で保護。カスタムドメイン導入が前提になりスコープが膨らむため不採用。

### D5: CI は PR 時に lint / typecheck / test / build を必須とする

- PR(develop / main 向け)で品質チェックを実行し、失敗時はマージ不可(ブランチ保護と連動)。デプロイジョブはマージ後の push イベントでのみ実行する。

### D6: ツールチェーン

- パッケージマネージャ: npm(追加ツール不要で CI がシンプル)。
- lint / format: ESLint + Prettier。テスト: Vitest。
- wrangler は `devDependencies` にバージョン固定で追加し、CI とローカルで同一バージョンを使う。

## Risks / Trade-offs

- [dev 環境が公開されている] → 個人情報は扱わない + noindex で緩和。センシティブな機能を dev に載せる段階になったらカスタムドメイン + Cloudflare Access(my_infra 経由)を導入する。
- [GitHub Secrets 未登録だとデプロイが失敗する] → 手作業手順を README とタスクに明記し、ワークフローは Secrets 欠如時に分かりやすくエラーになるようにする。
- [workers.dev の URL が Worker 名から推測可能] → 雛形段階では許容。本番はカスタムドメイン導入で解消予定。
- [wrangler / プロバイダのバージョンアップで挙動が変わる] → devDependencies でバージョン固定し、更新は PR(= dev 環境での検証)を経由させる。

## Migration Plan

新規構築のため移行はなし。デプロイの巻き戻しは以下:

1. dev で問題検知 → main へマージしない(本番影響なし)。
2. 本番で問題検知 → `wrangler rollback` または直前の正常コミットを main に revert して再デプロイ。

## Open Questions

- 本番用カスタムドメイン(例: disk0401.net / 新規取得ドメイン)をどれにするか → ドメイン決定後、my_infra への DNS 追加を含む別変更として起こす。

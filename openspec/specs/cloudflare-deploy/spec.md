# cloudflare-deploy

## Purpose

`develop` / `main` ブランチへのマージに連動して、Cloudflare Workers 上の dev / 本番環境へ自動デプロイする。Cloudflare 設定は可能な限り IaC で管理し、IaC で管理できない作業は手順書化してユーザーに実施を委ねる。

## Requirements

### Requirement: dev 環境への自動デプロイ
`develop` ブランチへ変更がマージ(push)されたとき、システムは Cloudflare Workers 上の dev 環境へ自動的にデプロイしなければならない(SHALL)。

#### Scenario: develop へのマージで dev 環境が更新される
- **WHEN** PR が `develop` ブランチにマージされる
- **THEN** GitHub Actions が `wrangler deploy` を dev 環境向けに実行し、dev 環境の URL(workers.dev)で変更内容が確認できる

#### Scenario: デプロイ失敗の通知
- **WHEN** dev 環境へのデプロイが失敗する
- **THEN** GitHub Actions のワークフローが失敗として記録され、原因がログから特定できる

### Requirement: 本番環境への自動デプロイ
`main` ブランチへ変更がマージ(push)されたとき、システムは Cloudflare Workers 上の本番環境へ自動的にデプロイしなければならない(SHALL)。

#### Scenario: main へのマージで本番環境が更新される
- **WHEN** PR が `main` ブランチにマージされる
- **THEN** GitHub Actions が `wrangler deploy` を本番環境向けに実行し、本番 URL で変更内容が確認できる

### Requirement: dev / 本番の環境分離
dev 環境と本番環境は別個の Worker として分離され、それぞれ独立した URL を持たなければならない(SHALL)。環境定義は `wrangler.jsonc` 内に宣言的に記述すること。

#### Scenario: 環境ごとに独立した URL
- **WHEN** dev と本番の両方がデプロイされている
- **THEN** それぞれ異なる workers.dev サブドメインでアクセスでき、dev への変更は本番に影響しない

### Requirement: PR 時の品質ゲート
`develop` / `main` へ向けた PR では lint / 型チェック / テスト / ビルドが CI で実行され、いずれかが失敗した場合はマージをブロックしなければならない(SHALL)。

#### Scenario: 品質チェック失敗時のマージブロック
- **WHEN** PR の CI で lint・型チェック・テスト・ビルドのいずれかが失敗する
- **THEN** PR のステータスチェックが失敗となり、マージできない

### Requirement: dev 環境の検索エンジン除外
dev 環境は検索エンジンにインデックスされてはならない(MUST NOT)。dev 環境のレスポンスにのみ noindex 指示を付与し、本番環境には付与しないこと。

#### Scenario: dev 環境のレスポンスヘッダ
- **WHEN** dev 環境の URL にアクセスする
- **THEN** レスポンスに noindex 指示(X-Robots-Tag ヘッダまたは同等の手段)が含まれる

#### Scenario: 本番環境は除外しない
- **WHEN** 本番環境の URL にアクセスする
- **THEN** noindex 指示は含まれない

### Requirement: Cloudflare 設定の IaC 管理と手作業手順の明示
Cloudflare に関する設定は可能な限りコードで管理しなければならない(SHALL)。Worker・環境定義は `wrangler.jsonc`、デプロイ条件は GitHub Actions、アカウント/ゾーンレベルのリソースは my_infra の Terraform で管理する。IaC で管理できない作業(API トークン発行、GitHub Secrets 登録、workers.dev サブドメイン設定、ブランチ保護設定)は、手順書としてドキュメント化しユーザーに実施を指示しなければならない(SHALL)。

#### Scenario: デプロイ設定の変更がコードレビューを経る
- **WHEN** デプロイ先やデプロイ条件を変更する
- **THEN** 変更は `wrangler.jsonc` または GitHub Actions 定義の PR として行われ、ダッシュボードでの直接変更は発生しない

#### Scenario: 手作業が必要な設定の実施
- **WHEN** IaC で管理できない設定(API トークン発行・Secrets 登録・ブランチ保護など)が必要になる
- **THEN** 実施手順がドキュメントに明示されており、ユーザーがその手順に従って実施できる

### Requirement: デプロイのロールバック手段
本番環境で問題が検知された場合、直前の正常な状態へ復旧する手段が提供され、その手順がドキュメント化されていなければならない(SHALL)。

#### Scenario: 本番デプロイの巻き戻し
- **WHEN** 本番デプロイ後に問題が検知される
- **THEN** `wrangler rollback` または正常コミットの revert → 再デプロイにより直前の正常状態へ復旧でき、その手順が README から辿れる

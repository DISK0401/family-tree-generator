# Proposal: setup-project-scaffold

## Why

リポジトリにはまだアプリケーション本体のコードが存在せず、機能開発を始めるための土台(ビルド・検証・デプロイの仕組み)がない。最初にプロジェクト雛形と Cloudflare 上へのデプロイパイプラインを整備することで、以降のすべての機能開発を「developブランチで dev 環境確認 → main ブランチで本番反映」という安全なフローで進められるようにする。

## What Changes

- **プロジェクト雛形の作成**: TypeScript / React / Vite ベースのフロントエンドプロジェクトを新規作成する(lint / format / テスト / ビルドがローカルで動作する状態まで)。
- **Cloudflare Workers(static assets)ホスティング設定**: wrangler 設定を追加し、dev / 本番の2環境を定義する。
- **ブランチ連動の自動デプロイ**:
  - `develop` ブランチへのマージ → Cloudflare 上の **dev 環境** へ自動デプロイ
  - `main` ブランチへのマージ → Cloudflare 上の **本番環境** へ自動デプロイ
- **`develop` ブランチの新設とブランチ運用ルールの明文化**(feature → develop → main)。
- **my_infra との役割分担**: カスタムドメイン・DNS レコード等の Cloudflare アカウント/ゾーンレベルのリソースが必要になる場合は、my_infra リポジトリの既存 Terraform 運用フロー(PR 作成 → Speculative Plan 確認 → main マージ → `/apply` コメントで apply)に従って追加する。本リポジトリ側では Workers アプリケーションのデプロイのみを扱う。
- **IaC 方針**: Cloudflare の設定は可能な限りコードで管理する(Worker・環境定義は `wrangler.jsonc`、デプロイ条件は GitHub Actions、アカウント/ゾーンリソースは my_infra の Terraform)。IaC で管理できない作業(API トークン発行、GitHub Secrets 登録、ブランチ保護設定など)は手順書として明示し、ユーザーに実施を指示する。
- **README.md の更新**: セットアップ手順・開発フロー・デプロイフローを記載する。

破壊的変更: なし(新規構築のみ)。

### 無料版 / 有償版への影響

- 直接の対象は **無料版**(クライアント完結の静的ホスティング)。ただし雛形・デプロイ基盤は有償版開発時にも共通の土台となる。
- 有償版バックエンド(Supabase / Stripe / Gemini API)の構築は本変更のスコープ外。

### プライバシー・法務への影響

- **影響なし**。本変更で扱うのは静的アセットのビルドとデプロイのみで、家系図データ・個人情報のデータフローは発生しない(無料版の「サーバへデータを送信しない」制約に変更なし)。
- dev 環境は開発中の未完成機能が露出するため、公開範囲(全公開か、Cloudflare Access 等でのアクセス制限か)を design で決定する。

### 競合調査について

本変更は開発基盤の構築でありユーザー向け機能を含まないため、競合製品の機能比較は対象外。後続の機能変更(家系図編集 UI 等)で実施する。

### ロールバック方針

- **アプリのデプロイ**: Cloudflare Workers はバージョン管理されており、`wrangler rollback` または直前の正常コミットの再デプロイで即時に戻せる。dev 環境で問題を検知した場合は main へマージしないことで本番影響を遮断できる。
- **雛形・CI 設定**: すべて git 管理のため `git revert` で巻き戻し可能。
- **my_infra 側のリソース**: Terraform 管理のため、該当リソース定義を削除する PR + `/apply` で撤去できる。

## Capabilities

### New Capabilities

- `project-scaffold`: TypeScript / React / Vite プロジェクトの雛形。依存管理、lint / format、テスト、ビルドがローカルおよび CI で実行できること。
- `cloudflare-deploy`: ブランチ連動デプロイ。`develop` マージで dev 環境、`main` マージで本番環境が Cloudflare Workers(static assets)上に自動デプロイされること。

### Modified Capabilities

なし(初回の変更のため既存 spec は存在しない)。

## Impact

- **family-tree-generator リポジトリ**:
  - 新規: アプリソースツリー一式(`src/` 等)、`package.json`、Vite / TypeScript / lint 設定、`wrangler` 設定、`.github/workflows/`(デプロイ用 CI)
  - 更新: `README.md`
  - ブランチ: `develop` ブランチの新設、GitHub 上のブランチ保護設定(手動作業)
- **my_infra リポジトリ**: カスタムドメインを割り当てる場合のみ `terraform/environments/personal/cloudflare/` 配下に DNS 等のリソースを既存フローで追加(design で要否を決定)。
- **外部依存・アカウント**: Cloudflare アカウント(既存)、Cloudflare API トークン(デプロイ用に GitHub Secrets へ登録)、GitHub Actions。

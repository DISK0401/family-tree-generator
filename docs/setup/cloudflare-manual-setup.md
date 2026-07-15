# Cloudflare デプロイの手動セットアップ手順

このリポジトリの Cloudflare 関連設定は、可能な限りコード(`wrangler.jsonc` / `.github/workflows/`)で管理しています。
以下は Cloudflare のダッシュボードや GitHub の管理画面でしか行えない、コード化不可能な作業です。**初回のみ**、リポジトリオーナーが実施してください。

実施後は、CI から自動的に `develop` → dev 環境 / `main` → 本番環境へのデプロイが行われるようになります。

## ① Cloudflare API トークンの発行

1. [Cloudflare ダッシュボード](https://dash.cloudflare.com/profile/api-tokens) にログインする。
2. 「トークンを作成する」→「カスタムトークンを作成する」を選択する。
3. 以下の権限を設定する。
   - **アカウント > Workers スクリプト > 編集**
   - **アカウント > アカウント設定 > 読み取り**(アカウント ID 確認用。既知の場合は省略可)
4. 対象アカウントを、本プロジェクトをデプロイする Cloudflare アカウントに限定する。
5. トークンを発行し、値を控える(この画面を離れると再表示できないため注意)。

## ② GitHub Secrets への登録

1. GitHub リポジトリの `Settings` → `Secrets and variables` → `Actions` を開く。
2. `New repository secret` から以下の 2 つを登録する。
   - `CLOUDFLARE_API_TOKEN`: ①で発行したトークン
   - `CLOUDFLARE_ACCOUNT_ID`: Cloudflare ダッシュボード右サイドバーに表示されるアカウント ID
3. 登録後、`.github/workflows/deploy.yml` の実行時にこれらの Secrets が利用される。

## ③ workers.dev サブドメインの確認

1. Cloudflare ダッシュボードの `Workers & Pages` を開く。
2. アカウントで `workers.dev` サブドメインが未設定の場合、画面の案内に従って設定する(アカウントにつき初回のみ必要)。
3. 設定済みであれば、デプロイ後に以下の URL でアクセスできる。
   - dev 環境: `https://family-tree-generator-dev.<サブドメイン>.workers.dev`
   - 本番環境: `https://family-tree-generator.<サブドメイン>.workers.dev`

## ④ `develop` ブランチの作成とブランチ保護

1. GitHub リポジトリで `main` から `develop` ブランチを作成する。
2. `Settings` → `Branches` → `Branch protection rules` で `main` と `develop` の両方に以下を設定する。
   - Pull Request を必須にする(直接 push を禁止)
   - マージ前に `Quality Gate` ワークフローのステータスチェックを必須にする

---

上記①〜④が完了すると、以降は以下のフローで自動的にデプロイされます。

- `develop` へ PR がマージされる → dev 環境へ自動デプロイ
- `main` へ PR がマージされる → 本番環境へ自動デプロイ

デプロイ設定自体(Worker の環境定義やデプロイ条件)を変更したい場合は、`wrangler.jsonc` または `.github/workflows/` を編集する PR を作成してください。ダッシュボード上での直接変更は行わないでください。

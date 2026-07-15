# project-scaffold

## ADDED Requirements

### Requirement: ローカル開発環境のセットアップ
プロジェクトは TypeScript / React / Vite で構成され、リポジトリを clone した開発者が標準的な npm コマンドのみで開発を開始できなければならない(SHALL)。

#### Scenario: クリーンな環境でのセットアップ
- **WHEN** リポジトリを clone し `npm install` を実行する
- **THEN** 依存関係がエラーなくインストールされる

#### Scenario: 開発サーバの起動
- **WHEN** `npm run dev` を実行する
- **THEN** ローカル開発サーバが起動し、ブラウザでプレースホルダーページが表示される

### Requirement: 品質チェックコマンド
プロジェクトは lint / フォーマットチェック / 型チェック / テストを npm スクリプトとして提供しなければならない(SHALL)。各コマンドはローカルと CI の両方で同一に動作すること。

#### Scenario: lint とフォーマットチェックの実行
- **WHEN** `npm run lint` を実行する
- **THEN** ESLint / Prettier によるチェックが実行され、違反があれば非ゼロ終了する

#### Scenario: 型チェックの実行
- **WHEN** `npm run typecheck` を実行する
- **THEN** TypeScript の型エラーがあれば非ゼロ終了する

#### Scenario: テストの実行
- **WHEN** `npm run test` を実行する
- **THEN** Vitest によるテストが実行され、少なくとも 1 件のサンプルテストが成功する

### Requirement: 本番ビルド
プロジェクトは `npm run build` で Cloudflare Workers(static assets)にデプロイ可能な静的アセットを生成しなければならない(SHALL)。

#### Scenario: ビルドの実行
- **WHEN** `npm run build` を実行する
- **THEN** 静的アセット一式が出力ディレクトリに生成され、非ゼロ終了しない

### Requirement: 無料版プライバシー制約の維持
雛形のアプリケーションは、家系図データ・個人情報を含むいかなるデータも外部サーバへ送信してはならない(MUST NOT)。外部への通信は静的アセットの取得のみとする。

#### Scenario: 初期表示時の外部通信
- **WHEN** プレースホルダーページをブラウザで表示する
- **THEN** 発生する通信は自ホストからの静的アセット取得のみで、外部 API へのデータ送信は発生しない

### Requirement: README によるセットアップ・開発フローの案内
README.md はセットアップ手順、npm スクリプト一覧、ブランチ運用(feature → develop → main)、デプロイフローを最新の状態で記載しなければならない(SHALL)。

#### Scenario: 新規開発者のオンボーディング
- **WHEN** README.md を読む
- **THEN** 環境構築から dev 環境デプロイまでの流れが README の記載のみで理解できる

## MODIFIED Requirements

### Requirement: ローカル開発環境のセットアップ
プロジェクトは TypeScript / React / Vite で構成され、リポジトリを clone した開発者が標準的な npm コマンドのみで開発を開始できなければならない(SHALL)。この要件はWindows・macOS・Linuxのいずれの開発環境でも満たされなければならない(SHALL)。ビルドツールが要求するプラットフォーム固有のネイティブバイナリ(オプション依存)は、ロックファイルの生成環境に関わらず、`npm install` のみで対象プラットフォーム向けが解決されなければならない(SHALL)。

#### Scenario: クリーンな環境でのセットアップ
- **WHEN** リポジトリを clone し `npm install` を実行する
- **THEN** 依存関係がエラーなくインストールされる

#### Scenario: 開発サーバの起動
- **WHEN** `npm run dev` を実行する
- **THEN** ローカル開発サーバが起動し、ブラウザでプレースホルダーページが表示される

#### Scenario: Windows環境でのクリーンなセットアップ
- **GIVEN** Linux環境で生成された `package-lock.json` がリポジトリにコミットされている
- **WHEN** Windows環境でリポジトリを clone し `npm install` を実行する
- **THEN** プラットフォーム固有のネイティブバイナリ(ビルドツールのオプション依存)を含め、追加のコマンド実行なしに依存関係がエラーなくインストールされる

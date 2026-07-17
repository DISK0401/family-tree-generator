# family-tree-generator

日本市場向けWeb家系図作成サービス。

## セットアップ

```bash
npm install
npm run dev
```

`http://localhost:5173` で家系図データのインポート/エクスポート画面が表示されます。

## GEDCOM / JSON インポート・エクスポート

無料版はクライアント(ブラウザ)完結で動作し、家系図データ・個人情報を一切サーバーへ送信しない。ファイルの読み込み・書き出しはすべてブラウザ内の処理のみで完結する。

### 対応フォーマット

| フォーマット | インポート | エクスポート | 用途 |
|---|---|---|---|
| GEDCOM 7.0 | ○ | ○(推奨) | 養子縁組・事実婚など複雑な家族関係まで表現できる最新規格 |
| GEDCOM 5.5.1互換 | ○ | ○ | 他の家系図サービス(MyHeritage 等)への移行に適した従来規格 |
| JSON(アプリ独自形式、`schemaVersion` 付き) | ○ | ○(完全バックアップ) | 内部データモデルをロスレスに保存・復元する独自形式 |

- GEDCOMのバージョン(7.0 / 5.5.1)はファイルヘッダから自動判定する。
- 文字コードは UTF-8(BOM有無とも)・UTF-16・Shift_JIS(国産ソフト由来ファイル対策)を自動判定して読み込む。
- 意味を解釈できない独自タグは破棄せず保全し、同一バージョンでの再エクスポート時に復元する(異なるバージョンへ変換する場合は保全のみで警告を表示する)。
- インポート結果は人物数・家族数・判定した文字コード・警告一覧(行番号・タグ・内容)をサマリ表示する。警告があってもインポート自体は成立する。
- 和暦⇄西暦の相互変換、旧字体・異体字を保持したままの入出力に対応する(明治以降の全元号+江戸後期の主要元号を収録)。

### 制限事項

- **GEDCOM ANSELエンコーディングは非対応。** 検出時はインポートを中断し、UTF-8で再エクスポートしたファイルの利用を案内する。
- **インポートファイルのサイズ上限は20MB。** 超過時は読み込み前に明示的なエラーとする。
- **バージョンをまたぐ再エクスポート(例: 5.5.1でインポート→7.0でエクスポート)では、保全した非対応タグの完全性を保証しない。** 変換されないタグがある場合は警告で明示する。
- GEDCOMのマルチメディア(`OBJE`)ファイル本体の取り込みは対象外(参照情報のみ保全)。

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

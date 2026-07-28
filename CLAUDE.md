# CLAUDE.md

## コマンド

| コマンド                                                      | 内容                                                     |
| ------------------------------------------------------------- | -------------------------------------------------------- |
| `npm run dev`                                                 | 開発サーバ(`/` ランディング、`/app` エディタ)            |
| `npm run test`                                                | Vitest(全テスト)。スコープ実行は `npx vitest run <path>` |
| `npm run lint` / `npm run format:check` / `npm run typecheck` | 品質チェック(CI と同じ)                                  |
| `npm run test:e2e`                                            | Playwright スモーク(外部送信ゼロ検証。要 chromium)       |
| `npm run build`                                               | `tsc -b && vite build`                                   |

Node は `.nvmrc`(22)を使う。PR の必須チェック名はジョブID `quality`(quality-gate.yml のジョブに `name:` を付けるとチェック名が変わり必須チェックが外れるので付けない)。

## アーキテクチャの要点

- レイヤ構成と各ディレクトリの役割は README「開発者向け情報 > アーキテクチャ」を参照。設計判断の経緯は `openspec/changes/archive/*/design.md`。
- 「無料版はデータを一切サーバーへ送信しない」が絶対制約(openspec/config.yaml)。外部リソース・解析タグ・CDN を追加しない。CSP(`worker/index.ts`)が `connect-src 'self'` を強制している。
- ドメイン層(`src/domain/`)は純関数。コマンドは不変更新で、`src/store/tree-store.ts` の undo 履歴は「旧 document の参照」をそのまま積む — ドキュメントを in-place で変更するコードを書いてはならない。
- ユーザー入力を HTML 文字列へ入れてよいのは `src/rendering/person-card.ts` のエスケープ済みヘルパ経由のみ。

## OpenSpec change のブランチ運用

1つの OpenSpec change(`openspec/changes/<name>/`)に関する作業は、雛形作成から実装・dev/本番のE2E検証・最終的な archive まで **同一のブランチ1本** で行う。

- 例: `claude/<change-name>` のようなブランチを最初に作成し、その change の作業が完全に終わる(= archive の PR が `develop` にマージされる)まで、同じブランチ名を使い続ける。
- `develop` へのマージ後に追加の commit が必要になった場合(dev 環境検証結果の記録、本番マージ後の検証記録、archive など)は、**新しいブランチ名を作らず**、同じブランチを最新の `develop` へ reset してから作業を続け、同じブランチ名で PR を出し直す。
  ```bash
  git fetch origin develop
  git checkout -B claude/<change-name> origin/develop
  # 変更を再適用してコミット
  git push -u origin claude/<change-name>
  ```
  (force-with-lease が必要な場合はユーザーに確認してから実行する)
- 途中で `develop` への実マージが必要になる理由(dev 環境への実デプロイを伴う検証など)がある場合は、そのつどマージしてよいが、ブランチ自体は使い回す。
- change の archive PR が `develop` にマージされたら、そのブランチは役目を終えたものとして **削除する**(GitHub 上のリモートブランチを削除)。

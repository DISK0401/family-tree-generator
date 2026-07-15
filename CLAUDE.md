# CLAUDE.md

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

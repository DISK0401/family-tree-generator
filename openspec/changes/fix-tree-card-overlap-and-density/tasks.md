## 1. カード寸法・氏名縮小しきい値の拡張(design.md D3)

- [x] 1.1 `src/layout/coordinates.ts` の `CARD_SIZE` を新しい高さ・幅に変更する(D3で決めた初期値。氏名3文字が全項目表示時でも等倍で収まることを1.2の目視確認で調整)。完了条件: `coordinates.test.ts` が新寸法を前提に更新され通過する — CARD_SIZE 104×116→128×148。テストはCARD_SIZEを定数参照しているため修正不要、そのまま通過を確認
- [x] 1.2 `src/organisms/tree-canvas/person-card.ts` の `nameFontScale` の `COMFORTABLE_CHARS` を2→3に変更する。完了条件: 名2〜3文字ではフォントサイズの指定(`style="font-size: ..."`)が付かず、4文字以上で付く
- [x] 1.3 `CARD_SIZE` を参照する既存テスト(`src/layout/coordinates.test.ts`, `src/layout/index.test.ts`, `src/layout/types.test.ts`)の期待値を新寸法に合わせて更新する。完了条件: 3ファイルとも `npx vitest run` で通過する — いずれもCARD_SIZE定数を参照しており数値ハードコードがないため、変更なしで通過を確認済み
- [x] 1.4 `person-card.test.ts` の「3文字以上の列は折り返さず、フォントサイズを縮小して1列のまま収める」テストのフィクスチャを4文字以上の氏名に差し替える。完了条件: 3文字(例:「仁三郎」)は縮小されず、4文字以上でのみ縮小される — 3文字無縮小の専用テストを追加し、既存テストは4文字(「愛梨奈美」)に差し替え

## 2. 性別インジケーター・故人マーカーの隣接配置(design.md D1)

- [x] 2.1 `person-card.css` の `.tree-card-deceased-mark` を `.tree-card-gender` の右隣に配置するよう変更する(絶対配置の `right` 指定をやめ、`left` で性別アイコンに隣接させる)。完了条件: 故人かつ性別ありの人物カードで、両方のアイコンが重ならず横並びに見える(2.4のスクリーンショットで確認)
- [x] 2.2 `.tree-card` の `padding-top` を、性別アイコン・故人マーカーの行の高さぶん拡大する(`--space-2`→`--space-5`)。完了条件: ふりがな表示オン/オフどちらでも、カード内の先頭フロー要素(ふりがな行または氏名列)がアイコン行より下から始まる
- [x] 2.3 `person-card.test.ts` に、故人マーカーが性別アイコンの隣に描画されること・非表示バッジの位置(`top:-8px; right:-8px`)と重ならないことを確認するテストを追加する。完了条件: 折りたたみ表示相当のオプション(`hiddenBadge`あり)+ `deceased: true` の組み合わせでスナップショット/属性値を検証するテストが通過する
- [x] 2.4 開発サーバでFamilyTreeCanvas(折りたたみ表示)・PedigreeCanvas(つながった全体表示)双方について、性別あり+故人+非表示バッジありの人物カードをスクリーンショットで目視確認する — Playwrightで実際のサンプル(渋沢栄一家)と、故人+非表示バッジ+長いふりがなを組み合わせた再現HTMLの両方で、重ならないことを確認

## 3. ふりがなの文字数縮小ロジック(design.md D2)

- [ ] 3.1 `person-card.ts` に、ふりがな用の文字数依存フォント縮小関数(`nameFontScale`とは別定数の`KANA_COMFORTABLE_CHARS`・下限値)を追加する
- [ ] 3.2 `personCardInnerHtml` の `.tree-card-kana` 生成箇所で、縮小関数の結果をインラインスタイルとして適用する。完了条件: 自社サンプル相当(「しぶさわ たけのすけ」9文字)が1行に収まり縮小される
- [ ] 3.3 `person-card.css` の `.tree-card-kana` に `white-space: nowrap; overflow: hidden; text-overflow: ellipsis;` を追加し、折り返しを禁止しつつ極端な長さへの保険を入れる。完了条件: 下限まで縮小しても収まらない長さの入力で、テキストが省略記号付きで1行に収まり、他の行の高さに影響しない
- [ ] 3.4 `person-card.test.ts` に、ふりがなの文字数縮小(通常/下限到達/フォールバックのellipsis)と、性別アイコン・故人マーカーと重ならない位置に描画されることを確認するテストを追加する

## 4. 表示設定を全項目オンにした場合の余白確認

- [ ] 4.1 `visibleCardFields` を全てオンにした状態のカードHTMLをテストで生成し、`person-card.css` のパディング・行間トークンを目視確認しながら微調整する(必要なら `.tree-card` の `gap` や `padding-bottom` を調整)
- [ ] 4.2 開発サーバで、ふりがな・生年月日・没年月日・年齢・生没地をすべてオンにした人物カード(画像2相当の再現データ)をスクリーンショットで確認し、要素間の余白が視認できることを確認する

## 5. 回帰確認・仕上げ

- [ ] 5.1 `npm run test` を実行し、既存テスト(特に `coordinates.test.ts`, `index.test.ts`, `person-card.test.ts`, `card-consistency`系)が全て通過することを確認する
- [ ] 5.2 `npm run typecheck` / `npm run lint` / `npm run format:check` を実行し、CIと同じ品質チェックを通過させる
- [ ] 5.3 `npm run test:e2e` を実行し、Playwrightスモークテストが全件パスすることを確認する(archiveゲート)
- [ ] 5.4 README.mdにカード寸法・氏名縮小しきい値に関する記述がある場合は更新する(なければ対応不要と明記して完了とする)

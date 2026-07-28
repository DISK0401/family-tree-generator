# 自己ホストWebフォント

Google Fonts CSS2 APIの配信物(unicode-range分割woff2スライス)をベンダリングしたもの。
参照する`@font-face`定義は `public/fonts.css` にあり(バンドルCSSに含めると全ルートの
初回描画をブロックするため、`src/main.tsx` が非同期に適用する)、ブラウザは表示に
必要な文字を含むスライスだけをダウンロードする。

ライセンス全文は同ディレクトリの `OFL.txt` を参照(SIL OFL 1.1 は再配布時の
ライセンス文書同梱を求めるため、URL参照ではなく全文を置いている)。

外部CDN(fonts.googleapis.com / fonts.gstatic.com)を使わないのは、
「データはあなたの端末から出ません」という製品の約束をフォント取得の
リクエストでも守るため。

## 収録フォントとライセンス

いずれも SIL Open Font License 1.1 (https://openfontlicense.org/) で提供されている。

- Shippori Mincho B1 (wght 500, 600) — © The Shippori Min Project Authors
  https://github.com/fontdasu/ShipporiMincho
- Zen Kaku Gothic New (wght 400, 500, 700) — © The Zen Project Authors
  https://github.com/googlefonts/zen-kakugothic

## 更新方法

Google Fonts CSS2 APIをChrome系User-Agentで取得し、CSS中の各スライスURLを
ダウンロードしてこのディレクトリへ置き、URLを `/fonts/<ファイル名>` へ
書き換えたCSSを `public/fonts.css` として保存する。

注意: `/fonts/` 配下は Worker が1年の immutable キャッシュを付けて配信する
(`worker/index.ts`)。同名ファイルの中身だけを差し替えると再訪ブラウザに反映されない
ため、更新時は必ず新しいファイル名(Google配信のURL由来の名前)ごと入れ替えること。

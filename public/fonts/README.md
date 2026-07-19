# 自己ホストWebフォント

Google Fonts CSS2 APIの配信物(unicode-range分割woff2スライス)をベンダリングしたもの。
参照する`@font-face`定義は `src/styles/fonts.css` にあり、ブラウザは表示に必要な文字を
含むスライスだけをダウンロードする。

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
書き換えたCSSを `src/styles/fonts.css` として保存する。

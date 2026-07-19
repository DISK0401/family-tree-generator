## ADDED Requirements

### Requirement: ページ間のヘッダー高さ統一
ランディングページのヘッダーと家系図エディタのヘッダーは、共通のデザイントークンに基づく高さ・余白を用い、視覚的に統一されていなければならない(SHALL)。

#### Scenario: ランディングとエディタでヘッダーの高さが揃う
- **WHEN** ランディングページ(`/`)と家系図エディタ(`/app`)のそれぞれのヘッダーを見比べる
- **THEN** 両者の高さ・余白が同一のデザイントークンに基づき視覚的に揃っている

## MODIFIED Requirements

### Requirement: メタ情報とOGPの整備
`index.html` は、日本語のページタイトル・`meta description`・OGP(`og:title`、`og:description`、`og:image`、`og:type`)・`twitter:card` を含まなければならない(SHALL)。`og:image` は自オリジンで配信される静的画像でなければならない(SHALL)。ファビコンは、製品名「家系図帖」を想起させる、既存のデザイントークン(墨・楮紙・藍・朱)を用いた固有の意匠でなければならず(SHALL)、汎用的・製品と無関係な図形であってはならない(MUST NOT)。

#### Scenario: OGPメタが設定されている
- **WHEN** `/` のHTMLソースを確認する
- **THEN** 日本語のtitle・description・OGP各タグ・twitter:cardが存在し、`og:image` が自オリジンの画像URLを指している

#### Scenario: ブランドにふさわしいファビコンが表示される
- **WHEN** ブラウザのタブでファビコンを確認する
- **THEN** 表示される図案は「家系図帖」のブランドを想起させる固有の意匠であり、製品と無関係な汎用図形ではない

import './LandingPage.css'
import { FeatureIcon, type FeatureIconKind } from './landing/FeatureIcon'
import { SampleGallery } from './landing/SampleGallery'
import { TreeFigure } from './landing/TreeFigure'
import { heroFigure } from './landing/figures'

/*
 * 製品紹介(ランディング)ページ(specs/product-intro-page)。
 * 完全静的: フォーム・API呼び出し・外部リソース読み込みを一切持たない(design.md D7)。
 * 文言の法務ルール: 観賞用・記念用の明記 / 「ご自身で取得した戸籍」前提 / 全自動を約束しない。
 */

interface FeatureItem {
  icon: FeatureIconKind
  title: string
  description: string
}

const AVAILABLE_FEATURES: FeatureItem[] = [
  {
    icon: 'privacy',
    title: 'ブラウザだけで完結',
    description:
      '家系図データはこの端末(ブラウザ)の中にだけ保存され、サーバーへは一切送信されません。会員登録も不要です。',
  },
  {
    icon: 'wareki',
    title: '和暦でも西暦でも',
    description:
      '「昭和39年10月10日」と入力しても「1964年10月10日」と入力しても、もう一方の表記がその場で確認できます。「頃」「以前」などの曖昧な日付にも対応。',
  },
  {
    icon: 'family',
    title: '複雑な家族関係もきれいに',
    description:
      '養子縁組・再婚・複数の配偶者にも対応。人物を増やすたびに図全体が自動整列し、系線が崩れません。養子は破線で描き分けます。',
  },
  {
    icon: 'autosave',
    title: 'この端末に自動保存',
    description:
      '編集内容は約1秒でこの端末に自動保存。ブラウザを閉じても、次に開いたときに続きから再開できます。',
  },
  {
    icon: 'io',
    title: 'GEDCOM/JSONで持ち運び自由',
    description:
      '家系図の標準形式GEDCOM(7.0 / 5.5.1互換)とJSONで読み込み・書き出しができます。他サービスからの乗り換えも、将来の引っ越しも自由です。',
  },
]

const COMING_SOON_FEATURES: FeatureItem[] = [
  {
    icon: 'scan',
    title: '戸籍スキャンから自動作成(有償予定)',
    description:
      'ご自身で取得した戸籍のスキャン画像から、AIが家系図の下書きを作成。内容はご自身で確認・修正しながら仕上げる方式です。',
  },
  {
    icon: 'cloud',
    title: 'クラウド保存と親族への共有(有償予定)',
    description:
      '家系図をクラウドに保存し、パスワードを知っている親族だけが閲覧できる形で共有できるようにする予定です。',
  },
  {
    icon: 'print',
    title: '高品質な印刷・PDF出力',
    description:
      '記念の一枚や親戚への配布に耐える、美しい印刷・PDF出力を予定しています。',
  },
]

function FeatureCard({
  item,
  comingSoon,
}: {
  item: FeatureItem
  comingSoon?: boolean
}) {
  return (
    <article
      className={
        comingSoon ? 'feature-card feature-card-coming-soon' : 'feature-card'
      }
    >
      <div className="feature-card-head">
        <FeatureIcon kind={item.icon} />
        {comingSoon ? (
          <span className="coming-soon-badge">実装予定</span>
        ) : null}
      </div>
      <h3>{item.title}</h3>
      <p>{item.description}</p>
    </article>
  )
}

export default function LandingPage() {
  return (
    <div className="landing">
      <header className="landing-header">
        <p className="landing-brand">家系図帖</p>
        <a className="landing-header-app-link" href="/app">
          アプリを開く
        </a>
      </header>

      <main>
        <section className="landing-hero" aria-labelledby="landing-hero-title">
          <div className="landing-hero-copy">
            <h1 id="landing-hero-title">
              家族の歴史を、
              <br />
              一枚の系図に。
            </h1>
            <p className="landing-hero-lead">
              家系図帖(かけいずちょう)は、ブラウザだけで家系図を作れる無料のサービスです。
              データはあなたの端末の中だけ。サーバーには何も送信されません。
            </p>
            <div className="landing-hero-actions">
              <a className="landing-cta" href="/app">
                無料ではじめる
              </a>
              <a className="landing-cta-secondary" href="#samples">
                サンプルを見る
              </a>
            </div>
            <p className="landing-hero-note">
              登録不要・インストール不要・無料
            </p>
          </div>
          <div className="landing-hero-figure">
            <TreeFigure
              figure={heroFigure}
              title="家系図のイメージ(架空の家族の例)"
            />
          </div>
        </section>

        <section
          className="landing-section"
          aria-labelledby="landing-features-title"
        >
          <h2 id="landing-features-title">いま使える機能</h2>
          <div className="feature-grid">
            {AVAILABLE_FEATURES.map((item) => (
              <FeatureCard key={item.title} item={item} />
            ))}
          </div>

          <h2
            id="landing-coming-soon-title"
            className="landing-coming-soon-heading"
          >
            これから追加予定の機能
          </h2>
          <div
            className="feature-grid"
            aria-labelledby="landing-coming-soon-title"
          >
            {COMING_SOON_FEATURES.map((item) => (
              <FeatureCard key={item.title} item={item} comingSoon />
            ))}
          </div>
        </section>

        <section
          className="landing-section"
          id="samples"
          aria-labelledby="landing-samples-title"
        >
          <h2 id="landing-samples-title">サンプルで完成イメージを見る</h2>
          <p className="landing-section-lead">
            歴史上の人物の家系図サンプルで、複雑な家族関係がどう表現されるかをご覧ください。そのままエディタで開いて、自由に編集を試せます。
          </p>
          <SampleGallery />
        </section>

        <section
          className="landing-section landing-privacy"
          aria-labelledby="landing-privacy-title"
        >
          <h2 id="landing-privacy-title">データはあなたの端末から出ません</h2>
          <p>
            家系図帖の無料版は、家系図データ・個人情報を一切サーバーへ送信しない設計です。すべてのデータはブラウザの中(IndexedDB)にだけ保存され、保存先は画面上に常に「この端末にのみ保存されます」と明示されます。バックアップや持ち運びには、GEDCOM/JSONの書き出しをご利用ください。
          </p>
        </section>
      </main>

      <footer className="landing-footer">
        <p>
          本サービスで作成する家系図は観賞用・記念用です。相続手続き等に用いる事実証明文書(相続関係説明図など)の作成には対応していません。
        </p>
        <p>
          偉人の家系図サンプルは、Wikipedia等で公開されている情報を基に主要な人物のみへ簡略化したものです(登場人物はすべて故人です)。「現代の家族」サンプルの人物はすべて架空です。
        </p>
        <p className="landing-footer-copyright">© 2026 家系図帖</p>
      </footer>
    </div>
  )
}

import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import LandingPage from './LandingPage'

describe('LandingPage', () => {
  it('エディタへの導線が2箇所(ヒーローCTA・ヘッダーリンク)ある', () => {
    render(<LandingPage />)
    expect(
      screen.getByRole('link', { name: '無料ではじめる' }),
    ).toHaveAttribute('href', '/app')
    expect(screen.getByRole('link', { name: 'アプリを開く' })).toHaveAttribute(
      'href',
      '/app',
    )
  })

  it('提供中機能5点が表示され、和暦・複雑な家族関係への対応が明記されている', () => {
    render(<LandingPage />)
    expect(
      screen.getByRole('heading', { name: 'ブラウザだけで完結' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: '和暦でも西暦でも' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: '複雑な家族関係もきれいに' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'この端末に自動保存' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'GEDCOM/JSONで持ち運び自由' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/養子縁組・再婚・複数の配偶者にも対応/),
    ).toBeInTheDocument()
  })

  it('Coming Soon機能に「実装予定」バッジが表示される', () => {
    render(<LandingPage />)
    expect(screen.getAllByText('実装予定')).toHaveLength(3)
    expect(
      screen.getByRole('heading', { name: /戸籍スキャンから自動作成/ }),
    ).toBeInTheDocument()
  })

  it('法務上の文言(観賞用・記念用/ご自身で取得した戸籍/確認・修正の前提)がある', () => {
    render(<LandingPage />)
    expect(screen.getByText(/観賞用・記念用です/)).toBeInTheDocument()
    expect(
      screen.getByText(
        /事実証明文書\(相続関係説明図など\)の作成には対応していません/,
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/ご自身で取得した戸籍のスキャン画像/),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/ご自身で確認・修正しながら仕上げる/),
    ).toBeInTheDocument()
  })

  it('プライバシー訴求(サーバーへ送信しない)が表示される', () => {
    render(<LandingPage />)
    expect(
      screen.getByRole('heading', { name: 'データはあなたの端末から出ません' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/一切サーバーへ送信しない設計/)).toBeInTheDocument()
  })

  it('サンプルギャラリー: タブ切替で表示が変わり、エディタで開くリンクがサンプルIDを含む', () => {
    render(<LandingPage />)
    const gallery = screen.getByRole('tabpanel')

    expect(
      within(gallery).getByRole('heading', { name: '徳川家康の家系図' }),
    ).toBeInTheDocument()
    expect(
      within(gallery).getByRole('link', {
        name: 'このサンプルをエディタで開く',
      }),
    ).toHaveAttribute('href', '/app?sample=tokugawa-ieyasu')

    fireEvent.click(screen.getByRole('tab', { name: /夏目漱石/ }))
    expect(
      within(screen.getByRole('tabpanel')).getByRole('heading', {
        name: '夏目漱石の家系図',
      }),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('tabpanel')).getByRole('link', {
        name: 'このサンプルをエディタで開く',
      }),
    ).toHaveAttribute('href', '/app?sample=natsume-soseki')
  })

  it('サンプルに注記(公知情報の簡略化・架空明記)が表示される', () => {
    render(<LandingPage />)
    expect(
      screen.getByText(/公知情報を基に、主要な人物のみへ簡略化したサンプル/),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: /現代の家族/ }))
    expect(
      screen.getByText(/登場する人物・家族はすべて架空です/),
    ).toBeInTheDocument()
  })

  it('旧字体を含むサンプル(澁澤榮一)が表示できる', () => {
    render(<LandingPage />)
    fireEvent.click(screen.getByRole('tab', { name: /渋沢栄一/ }))
    expect(
      within(screen.getByRole('tabpanel')).getByRole('heading', {
        name: '澁澤榮一の家系図',
      }),
    ).toBeInTheDocument()
  })
})

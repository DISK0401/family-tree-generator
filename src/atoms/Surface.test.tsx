import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Surface } from './Surface'

describe('Surface', () => {
  it('variant が面のクラスへ落ちる', () => {
    const { container } = render(<Surface variant="raised">紙</Surface>)
    expect(container.firstElementChild?.className).toBe('surface--raised')
  })

  it('コンポーネント固有のクラスは面の後ろへ足す(上書きできる順序)', () => {
    const { container } = render(
      <Surface variant="floating" className="settings-menu-panel">
        メニュー
      </Surface>,
    )
    expect(container.firstElementChild?.className).toBe(
      'surface--floating settings-menu-panel',
    )
  })

  it('既定は div、as で別の要素にできる', () => {
    const { container: div } = render(<Surface variant="sunken">a</Surface>)
    expect(div.firstElementChild?.tagName).toBe('DIV')

    const { container: fieldset } = render(
      <Surface variant="fieldset" as="fieldset">
        <legend>生年月日</legend>
      </Surface>,
    )
    expect(fieldset.firstElementChild?.tagName).toBe('FIELDSET')
  })

  it('通知面は role を渡して支援技術へ伝えられる', () => {
    render(
      <Surface variant="notice-danger" role="alert">
        読み込めません
      </Surface>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('読み込めません')
  })
})

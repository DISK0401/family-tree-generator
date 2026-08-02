import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './Button'

describe('Button', () => {
  it('type の既定は button(フォーム内で意図せず submit しない)', () => {
    render(
      <form>
        <Button>押す</Button>
      </form>,
    )
    expect(screen.getByRole('button', { name: '押す' })).toHaveAttribute(
      'type',
      'button',
    )
  })

  it('type を明示すれば submit にできる', () => {
    render(<Button type="submit">確定</Button>)
    expect(screen.getByRole('button', { name: '確定' })).toHaveAttribute(
      'type',
      'submit',
    )
  })

  it('variant が基本形のクラスへ落ちる', () => {
    render(<Button variant="danger-outline">削除</Button>)
    const button = screen.getByRole('button', { name: '削除' })
    expect(button.className.split(' ')).toEqual(
      expect.arrayContaining(['btn', 'btn--danger-outline']),
    )
  })

  it('variant 未指定(bare)では基本形のみを当てる', () => {
    render(<Button>素</Button>)
    expect(screen.getByRole('button', { name: '素' }).className).toBe('btn')
  })

  it('tight で行送りを保つバリアントを足す', () => {
    render(
      <Button variant="outline" tight>
        詰め
      </Button>,
    )
    expect(screen.getByRole('button', { name: '詰め' })).toHaveClass(
      'btn--tight',
    )
  })

  it('コンポーネント固有のクラスは基本形の後ろへ足す(上書きできる順序)', () => {
    render(
      <Button variant="outline" className="my-button">
        個別
      </Button>,
    )
    expect(screen.getByRole('button', { name: '個別' }).className).toBe(
      'btn btn--outline my-button',
    )
  })

  it('pressed が aria-pressed へ落ちる', () => {
    render(
      <Button variant="outline" pressed>
        選択中
      </Button>,
    )
    expect(screen.getByRole('button', { name: '選択中' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('pressed 未指定では aria-pressed を出さない(トグルではないボタン)', () => {
    render(<Button variant="outline">ただのボタン</Button>)
    expect(
      screen.getByRole('button', { name: 'ただのボタン' }),
    ).not.toHaveAttribute('aria-pressed')
  })

  it('onClick と disabled はそのまま素の button へ渡る', () => {
    const onClick = vi.fn()
    render(
      <Button onClick={onClick} disabled>
        無効
      </Button>,
    )
    const button = screen.getByRole('button', { name: '無効' })
    expect(button).toBeDisabled()
    button.click()
    expect(onClick).not.toHaveBeenCalled()
  })
})

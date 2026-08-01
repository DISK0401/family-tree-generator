import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Field } from './Field'

describe('Field', () => {
  it('見出しと入力が関連付く(ラベル名で入力を取得できる)', () => {
    render(
      <Field label="姓">
        {(props) => <input {...props} type="text" defaultValue="山田" />}
      </Field>,
    )
    expect(screen.getByLabelText('姓')).toHaveValue('山田')
  })

  it('補助表示が aria-describedby で関連付く', () => {
    render(
      <Field label="生年月日" hint="1964年10月10日">
        {(props) => <input {...props} type="text" />}
      </Field>,
    )
    const input = screen.getByLabelText('生年月日')
    const describedBy = input.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy!)?.textContent).toBe(
      '1964年10月10日',
    )
  })

  it('エラーがあるときは補助表示より優先して関連付け、alert として通知する', () => {
    render(
      <Field label="生年月日" hint="補助" error="日付として解釈できません">
        {(props) => <input {...props} type="text" />}
      </Field>,
    )
    const input = screen.getByLabelText('生年月日')
    const describedBy = input.getAttribute('aria-describedby')
    expect(document.getElementById(describedBy!)?.textContent).toBe(
      '日付として解釈できません',
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      '日付として解釈できません',
    )
    // エラー時は補助表示を出さない(読み上げが二重にならないように)
    expect(screen.queryByText('補助')).toBeNull()
  })

  it('補助もエラーも無ければ aria-describedby を出さない', () => {
    render(
      <Field label="場所">{(props) => <input {...props} type="text" />}</Field>,
    )
    expect(screen.getByLabelText('場所')).not.toHaveAttribute(
      'aria-describedby',
    )
  })

  it('hideLabel でも読み上げ用のラベルは残る', () => {
    render(
      <Field label="婚姻日" hideLabel>
        {(props) => <input {...props} type="text" />}
      </Field>,
    )
    // 視覚的に隠すクラスは当たるが、ラベルとしての関連付けは保たれる
    expect(screen.getByLabelText('婚姻日')).toBeInTheDocument()
    expect(screen.getByText('婚姻日')).toHaveClass('visually-hidden')
  })

  it('補助表示・エラー表示の段落へクラスを足せる(DOM形状を呼び出し側と揃える)', () => {
    const { container } = render(
      <Field label="生年月日" hint="補助" hintClassName="my-hint">
        {(props) => <input {...props} type="text" />}
      </Field>,
    )
    expect(container.querySelector('p.my-hint')?.textContent).toBe('補助')
  })

  it('row で横並びのクラスを足す', () => {
    const { container } = render(
      <Field label="表示形式" row>
        {(props) => (
          <select {...props}>
            <option>西暦</option>
          </select>
        )}
      </Field>,
    )
    expect(container.firstElementChild?.className).toBe(
      'field-label field-label--row',
    )
  })

  it('select / textarea でも同じ関連付けが働く', () => {
    render(
      <>
        <Field label="性別">
          {(props) => (
            <select {...props}>
              <option>男</option>
            </select>
          )}
        </Field>
        <Field label="メモ">{(props) => <textarea {...props} />}</Field>
      </>,
    )
    expect(screen.getByLabelText('性別').tagName).toBe('SELECT')
    expect(screen.getByLabelText('メモ').tagName).toBe('TEXTAREA')
  })
})

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WarekiDateInput } from './WarekiDateInput'

describe('WarekiDateInput: 和暦入力時の西暦即時表示', () => {
  it('「昭和39年10月10日」入力で「1964年10月10日」が即時表示され、確定するとFuzzyDateとして反映される', () => {
    const onChange = vi.fn()
    render(<WarekiDateInput label="生年月日" value={undefined} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('生年月日'), { target: { value: '昭和39年10月10日' } })

    expect(screen.getByText('1964年10月10日')).toBeInTheDocument()
    expect(onChange).toHaveBeenCalledWith({
      original: '昭和39年10月10日',
      qualifier: 'exact',
      date: { year: 1964, month: 10, day: 10 },
    })
  })
})

describe('WarekiDateInput: 西暦入力時の和暦即時表示', () => {
  it('「1964-10-10」入力で「昭和39年10月10日」が即時表示される', () => {
    const onChange = vi.fn()
    render(<WarekiDateInput label="生年月日" value={undefined} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('生年月日'), { target: { value: '1964-10-10' } })

    expect(screen.getByText('昭和39年10月10日')).toBeInTheDocument()
  })
})

describe('WarekiDateInput: 不正な日付の入力', () => {
  it('「昭和65年1月1日」でエラー理由が表示され、onChangeは呼ばれない', () => {
    const onChange = vi.fn()
    render(<WarekiDateInput label="生年月日" value={undefined} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('生年月日'), { target: { value: '昭和65年1月1日' } })

    expect(screen.getByRole('alert')).toHaveTextContent('昭和は64年まで')
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByLabelText('生年月日')).toHaveAttribute('aria-invalid', 'true')
  })
})

describe('WarekiDateInput: 修飾子', () => {
  it('「昭和10年頃」も西暦換算が表示される', () => {
    const onChange = vi.fn()
    render(<WarekiDateInput label="生年月日" value={undefined} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('生年月日'), { target: { value: '昭和10年頃' } })

    expect(screen.getByText('1935年')).toBeInTheDocument()
    expect(onChange).toHaveBeenCalledWith({
      original: '昭和10年頃',
      qualifier: 'about',
      date: { year: 1935 },
    })
  })
})

describe('WarekiDateInput: クリア', () => {
  it('入力を空にするとonChange(undefined)が呼ばれる', () => {
    const onChange = vi.fn()
    render(
      <WarekiDateInput
        label="生年月日"
        value={{ original: '1990', qualifier: 'exact', date: { year: 1990 } }}
        onChange={onChange}
      />,
    )
    fireEvent.change(screen.getByLabelText('生年月日'), { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith(undefined)
  })
})

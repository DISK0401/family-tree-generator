import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ImportSummary } from './ImportSummary'
import type { ImportSummaryInfo } from './ImportPanel'

describe('ImportSummary', () => {
  it('人数・家族数・エンコーディング・警告なしを表示する', () => {
    const summary: ImportSummaryInfo = {
      format: 'gedcom',
      peopleCount: 3,
      familiesCount: 1,
      encoding: 'shift_jis',
      gedcomVersion: '5.5.1',
      warnings: [],
    }
    render(<ImportSummary summary={summary} />)

    expect(screen.getByText(/人物 3名・家族 1件/)).toBeInTheDocument()
    expect(screen.getByText(/Shift_JIS/)).toBeInTheDocument()
    expect(screen.getByText('警告はありません。')).toBeInTheDocument()
  })

  it('警告一覧を行番号・タグ付きで表示する', () => {
    const summary: ImportSummaryInfo = {
      format: 'gedcom',
      peopleCount: 1,
      familiesCount: 0,
      gedcomVersion: '7.0',
      warnings: [
        { lineNumber: 5, tag: 'DATE', message: '日付を原文のまま保持しました' },
      ],
    }
    render(<ImportSummary summary={summary} />)

    expect(screen.getByText(/1件の警告があります/)).toBeInTheDocument()
    expect(screen.getByText(/5行目/)).toBeInTheDocument()
    expect(screen.getByText(/日付を原文のまま保持しました/)).toBeInTheDocument()
  })
})

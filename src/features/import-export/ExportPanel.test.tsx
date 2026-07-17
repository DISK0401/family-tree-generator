import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createId } from '../../domain/id'
import type { FamilyTreeData } from '../../domain/model'
import { ExportPanel } from './ExportPanel'

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:mock-url')
  URL.revokeObjectURL = vi.fn()
})

describe('ExportPanel', () => {
  it('3形式の選択肢と個人情報の注意書きを表示する', () => {
    const data: FamilyTreeData = { people: [], families: [] }
    render(<ExportPanel data={data} />)

    expect(screen.getByText('GEDCOM 7.0(推奨)')).toBeInTheDocument()
    expect(screen.getByText('GEDCOM 5.5.1互換')).toBeInTheDocument()
    expect(screen.getByText('JSON(完全バックアップ)')).toBeInTheDocument()
    expect(screen.getByText(/個人情報が含まれます/)).toBeInTheDocument()
  })

  it('人物が0名のときエクスポートボタンは無効化される', () => {
    const data: FamilyTreeData = { people: [], families: [] }
    render(<ExportPanel data={data} />)

    expect(screen.getByRole('button', { name: 'エクスポート' })).toBeDisabled()
  })

  it('エクスポートを実行するとダウンロードが発生する', () => {
    const clickSpy = vi.fn()
    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      const element = originalCreateElement(tagName)
      if (tagName === 'a') {
        element.click = clickSpy
      }
      return element
    })

    const data: FamilyTreeData = {
      people: [{ id: createId(), name: { given: '太郎' } }],
      families: [],
    }
    render(<ExportPanel data={data} />)

    fireEvent.click(screen.getByRole('button', { name: 'エクスポート' }))

    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)

    vi.restoreAllMocks()
  })

  it('事実婚を5.5.1でエクスポートすると警告が表示される', () => {
    const partnerA = { id: createId(), name: { given: 'A' } }
    const partnerB = { id: createId(), name: { given: 'B' } }
    const data: FamilyTreeData = {
      people: [partnerA, partnerB],
      families: [
        {
          id: createId(),
          partnerIds: [partnerA.id, partnerB.id],
          relationshipType: 'defacto',
          children: [],
        },
      ],
    }
    render(<ExportPanel data={data} />)

    fireEvent.click(screen.getByLabelText(/GEDCOM 5.5.1互換/))
    fireEvent.click(screen.getByRole('button', { name: 'エクスポート' }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      '5.5.1では標準表現できない',
    )
  })
})

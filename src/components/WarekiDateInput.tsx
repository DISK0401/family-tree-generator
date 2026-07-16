import { useId, useState } from 'react'
import type { FuzzyDate } from '../domain/types'
import { parseDateInput } from '../domain/parse-date'
import { ERA_TABLE, formatGregorian, formatWareki, gregorianToWareki } from '../domain/wareki'
import './WarekiDateInput.css'

interface WarekiDateInputProps {
  label: string
  value: FuzzyDate | undefined
  onChange: (value: FuzzyDate | undefined) => void
}

/** 入力原文が和暦表記かどうかを元号名の有無で判定する */
function looksLikeWareki(original: string): boolean {
  return ERA_TABLE.some((era) => original.trim().startsWith(era.name))
}

function counterpartLabel(date: FuzzyDate): string | null {
  if (!date.date) return null
  if (looksLikeWareki(date.original)) {
    const g1 = formatGregorian(date.date)
    const g2 = date.date2 ? formatGregorian(date.date2) : undefined
    return g2 ? `${g1}〜${g2}` : g1
  }
  const w1 = gregorianToWareki(date.date)
  if (!w1) return null
  const w2 = date.date2 ? gregorianToWareki(date.date2) : undefined
  const w1s = formatWareki(w1)
  const w2s = w2 ? formatWareki(w2) : undefined
  return w2s ? `${w1s}〜${w2s}` : w1s
}

/**
 * 和暦・西暦のどちらでも入力を受け付け、もう一方の表記を即時表示する日付入力。
 * 「頃・以前・以後・範囲」の修飾子にも対応する(spec tree-editor参照)。
 */
export function WarekiDateInput({ label, value, onChange }: WarekiDateInputProps) {
  const [text, setText] = useState(value?.original ?? '')
  const [parsed, setParsed] = useState<FuzzyDate | undefined>(value)
  const [error, setError] = useState<string | null>(null)
  const inputId = useId()

  function handleChange(next: string) {
    setText(next)
    if (next.trim() === '') {
      setError(null)
      setParsed(undefined)
      onChange(undefined)
      return
    }
    const result = parseDateInput(next)
    if (result.ok) {
      setError(null)
      setParsed(result.value)
      onChange(result.value)
    } else {
      setError(result.message)
      setParsed(undefined)
    }
  }

  const counterpart = parsed ? counterpartLabel(parsed) : null

  return (
    <div className="wareki-date-input">
      <label htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        type="text"
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="昭和39年10月10日 / 1964-10-10"
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${inputId}-error` : counterpart ? `${inputId}-hint` : undefined}
      />
      {counterpart && (
        <p id={`${inputId}-hint`} className="wareki-date-input-hint">
          {counterpart}
        </p>
      )}
      {error && (
        <p id={`${inputId}-error`} className="wareki-date-input-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

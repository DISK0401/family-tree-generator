import { useId, useState, type KeyboardEvent } from 'react'
import { displayName } from '../domain/helpers'
import type { Person, PersonId } from '../domain/types'
import './PersonPicker.css'

interface PersonPickerProps {
  id?: string
  candidates: Person[]
  onSelect: (personId: PersonId) => void
  placeholder?: string
}

function matches(person: Person, query: string): boolean {
  const name = displayName(person).toLowerCase()
  if (name.includes(query)) return true
  const kana = [person.name.surnameKana, person.name.givenKana].filter(Boolean).join(' ')
  return kana.toLowerCase().includes(query)
}

/**
 * キーワード入力で絞り込める、既存人物選択用のコンボボックス(spec tree-editor)。
 *
 * 家系図の人物が増えるほど素朴な`<select>`(design.md リスク「link操作の候補<select>が
 * 人数に対して破綻する」)では選びにくくなるため、氏名・ふりがなの部分一致で絞り込む。
 * 選択(クリックまたはEnter)すると即座に`onSelect`を呼んで入力欄を空に戻す。呼び出し側は
 * `<select>`と同じ「選択したら即時反映」の使い方ができ、確定操作を挟まない
 * (PersonPanel/FamilyEventEditorの既存方針を踏襲)。
 */
export function PersonPicker({ id, candidates, onSelect, placeholder }: PersonPickerProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const listId = useId()

  const normalizedQuery = query.trim().toLowerCase()
  const filtered = normalizedQuery
    ? candidates.filter((p) => matches(p, normalizedQuery))
    : candidates

  function select(person: Person) {
    onSelect(person.id)
    setQuery('')
    setOpen(false)
    setActiveIndex(-1)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      // 候補が1件に絞られていれば、ハイライト前でもEnterだけで選べるようにする
      const target = filtered[activeIndex] ?? (filtered.length === 1 ? filtered[0] : undefined)
      if (target) {
        e.preventDefault()
        select(target)
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
      setActiveIndex(-1)
    }
  }

  return (
    <div className="person-picker">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={placeholder ?? '氏名で絞り込み'}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          setActiveIndex(-1)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // 候補クリック(onMouseDown)を先に処理させてから閉じる
          window.setTimeout(() => setOpen(false), 100)
        }}
        onKeyDown={handleKeyDown}
      />
      {open && (
        <ul id={listId} role="listbox" className="person-picker-list">
          {filtered.length === 0 ? (
            <li className="person-picker-empty">該当する人物がいません</li>
          ) : (
            filtered.map((p, index) => (
              <li key={p.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  className={index === activeIndex ? 'active' : undefined}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => select(p)}
                >
                  {displayName(p)}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}

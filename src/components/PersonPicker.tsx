import {
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from 'react'
import { displayName } from '../domain/helpers'
import type { Person, PersonId } from '../domain/types'
import './PersonPicker.css'

interface PersonPickerProps {
  id?: string
  candidates: Person[]
  onSelect: (personId: PersonId) => void
  placeholder?: string
  /** ConfirmDialog内に置く場合、初期フォーカスの対象(data-autofocus)にする */
  autoFocus?: boolean
}

function matches(person: Person, query: string): boolean {
  const name = displayName(person).toLowerCase()
  if (name.includes(query)) return true
  const kana = [person.name.surnameKana, person.name.givenKana]
    .filter(Boolean)
    .join(' ')
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
 *
 * a11y(監査 中7): listboxの選択肢は`li`自身に`role="option"`とidを持たせ
 * (フォーカス可能な内側ボタンは置かない)、入力欄の`aria-activedescendant`で
 * ハイライト中の候補を支援技術へ伝える(コンボボックスの標準パターン)。
 */
export function PersonPicker({
  id,
  candidates,
  onSelect,
  placeholder,
  autoFocus,
}: PersonPickerProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)

  const normalizedQuery = query.trim().toLowerCase()
  const filtered = normalizedQuery
    ? candidates.filter((p) => matches(p, normalizedQuery))
    : candidates

  function optionId(index: number): string {
    return `${listId}-option-${index}`
  }

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
      const target =
        filtered[activeIndex] ??
        (filtered.length === 1 ? filtered[0] : undefined)
      if (target) {
        e.preventDefault()
        select(target)
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
      setActiveIndex(-1)
    }
  }

  function handleBlur(e: FocusEvent<HTMLInputElement>) {
    // フォーカスの移動先がピッカー内(候補リスト等)なら閉じない。
    // 以前のsetTimeout(100)方式はタイマーの競合で「選択できたりできなかったり」する
    // 揺らぎの温床だったため、relatedTargetによる判定へ置き換えた(監査 中7)
    if (rootRef.current?.contains(e.relatedTarget)) return
    setOpen(false)
    setActiveIndex(-1)
  }

  const activeOptionId =
    open && activeIndex >= 0 && activeIndex < filtered.length
      ? optionId(activeIndex)
      : undefined

  return (
    <div className="person-picker" ref={rootRef}>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeOptionId}
        autoComplete="off"
        data-autofocus={autoFocus ? '' : undefined}
        placeholder={placeholder ?? '氏名で絞り込み'}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          setActiveIndex(-1)
        }}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
      {open && (
        <ul id={listId} role="listbox" className="person-picker-list">
          {filtered.length === 0 ? (
            <li className="person-picker-empty">該当する人物がいません</li>
          ) : (
            filtered.map((p, index) => (
              <li
                key={p.id}
                id={optionId(index)}
                role="option"
                aria-selected={index === activeIndex}
                className={
                  index === activeIndex
                    ? 'person-picker-option active'
                    : 'person-picker-option'
                }
                // フォーカスを入力欄に残したまま選択できるようにする(blurで閉じない)
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(p)}
              >
                {displayName(p)}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}

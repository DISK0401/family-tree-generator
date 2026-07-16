import { useId } from 'react'
import './PersonNameFields.css'

interface PersonNameFieldsProps {
  surname: string
  given: string
  onSurnameChange: (value: string) => void
  onGivenChange: (value: string) => void
  autoFocus?: boolean
}

/** 姓・名の2フィールド入力。空状態ガイド・コンテキストアクションの人物追加フォームで共有する */
export function PersonNameFields({
  surname,
  given,
  onSurnameChange,
  onGivenChange,
  autoFocus,
}: PersonNameFieldsProps) {
  const surnameId = useId()
  const givenId = useId()
  return (
    <div className="person-name-fields">
      <label htmlFor={surnameId}>
        姓
        <input
          id={surnameId}
          type="text"
          value={surname}
          onChange={(e) => onSurnameChange(e.target.value)}
          placeholder="山田"
          autoFocus={autoFocus}
        />
      </label>
      <label htmlFor={givenId}>
        名
        <input
          id={givenId}
          type="text"
          value={given}
          onChange={(e) => onGivenChange(e.target.value)}
          placeholder="太郎"
        />
      </label>
    </div>
  )
}

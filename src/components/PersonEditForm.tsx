import { useId, useState, type FormEvent } from 'react'
import type { FuzzyDate, Gender, Person } from '../domain/types'
import { PersonNameFields } from './PersonNameFields'
import { WarekiDateInput } from './WarekiDateInput'
import './PersonEditForm.css'

interface PersonEditFormProps {
  person: Person
  onSave: (patch: Partial<Omit<Person, 'id'>>) => void
}

const GENDER_LABEL: Record<Gender, string> = {
  male: '男',
  female: '女',
  unknown: '不明',
}

/**
 * 人物情報の編集フォーム(氏名・ふりがな・性別・生没イベント・メモ)。
 * 変更は「確定」操作でまとめて反映する(spec tree-editor)。
 */
export function PersonEditForm({ person, onSave }: PersonEditFormProps) {
  const [surname, setSurname] = useState(person.name.surname ?? '')
  const [given, setGiven] = useState(person.name.given ?? '')
  const [surnameKana, setSurnameKana] = useState(person.name.surnameKana ?? '')
  const [givenKana, setGivenKana] = useState(person.name.givenKana ?? '')
  const [gender, setGender] = useState<Gender>(person.gender)
  const [birthDate, setBirthDate] = useState<FuzzyDate | undefined>(person.birth?.date)
  const [birthPlace, setBirthPlace] = useState(person.birth?.place ?? '')
  const [deathDate, setDeathDate] = useState<FuzzyDate | undefined>(person.death?.date)
  const [deathPlace, setDeathPlace] = useState(person.death?.place ?? '')
  const [note, setNote] = useState(person.note ?? '')
  const genderId = useId()
  const birthPlaceId = useId()
  const deathPlaceId = useId()
  const noteId = useId()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    onSave({
      name: {
        ...(surname.trim() && { surname: surname.trim() }),
        ...(given.trim() && { given: given.trim() }),
        ...(surnameKana.trim() && { surnameKana: surnameKana.trim() }),
        ...(givenKana.trim() && { givenKana: givenKana.trim() }),
      },
      gender,
      birth:
        birthDate || birthPlace.trim()
          ? { type: 'birth', ...(birthDate && { date: birthDate }), ...(birthPlace.trim() && { place: birthPlace.trim() }) }
          : undefined,
      death:
        deathDate || deathPlace.trim()
          ? { type: 'death', ...(deathDate && { date: deathDate }), ...(deathPlace.trim() && { place: deathPlace.trim() }) }
          : undefined,
      note: note.trim() || undefined,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="person-edit-form">
      <PersonNameFields
        surname={surname}
        given={given}
        onSurnameChange={setSurname}
        onGivenChange={setGiven}
      />
      <div className="person-edit-form-kana-fields">
        <label>
          姓(ふりがな)
          <input type="text" value={surnameKana} onChange={(e) => setSurnameKana(e.target.value)} placeholder="やまだ" />
        </label>
        <label>
          名(ふりがな)
          <input type="text" value={givenKana} onChange={(e) => setGivenKana(e.target.value)} placeholder="たろう" />
        </label>
      </div>

      <label htmlFor={genderId} className="person-edit-form-field">
        性別
        <select id={genderId} value={gender} onChange={(e) => setGender(e.target.value as Gender)}>
          {(Object.keys(GENDER_LABEL) as Gender[]).map((g) => (
            <option key={g} value={g}>
              {GENDER_LABEL[g]}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="person-edit-form-event">
        <legend>生年月日</legend>
        <WarekiDateInput label="生年月日" hideLabel value={birthDate} onChange={setBirthDate} />
        <label htmlFor={birthPlaceId} className="person-edit-form-field">
          場所
          <input id={birthPlaceId} type="text" value={birthPlace} onChange={(e) => setBirthPlace(e.target.value)} />
        </label>
      </fieldset>

      <fieldset className="person-edit-form-event">
        <legend>没年月日</legend>
        <WarekiDateInput label="没年月日" hideLabel value={deathDate} onChange={setDeathDate} />
        <label htmlFor={deathPlaceId} className="person-edit-form-field">
          場所
          <input id={deathPlaceId} type="text" value={deathPlace} onChange={(e) => setDeathPlace(e.target.value)} />
        </label>
      </fieldset>

      <label htmlFor={noteId} className="person-edit-form-field">
        メモ
        <textarea id={noteId} value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
      </label>

      <button type="submit" className="person-edit-form-submit">
        確定
      </button>
    </form>
  )
}

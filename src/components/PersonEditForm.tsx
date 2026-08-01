import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from 'react'
import type { FuzzyDate, Gender, Person } from '../domain/types'
import { PersonNameFields } from './PersonNameFields'
import { WarekiDateInput } from './WarekiDateInput'
import './PersonEditForm.css'

interface PersonEditFormProps {
  person: Person
  onSave: (patch: Partial<Omit<Person, 'id'>>) => void
  /** 未確定の変更(ダーティ状態)を親へ通知する(design.md D3) */
  onDirtyChange?: (isDirty: boolean) => void
  /** 親から`requestSubmit()`でプログラム的に確定操作を実行できるようにする(design.md D3「保存して移動する」用) */
  formRef?: RefObject<HTMLFormElement | null>
}

const GENDER_LABEL: Record<Gender, string> = {
  male: '男',
  female: '女',
  unknown: '不明',
}

function fuzzyDateEqual(
  a: FuzzyDate | undefined,
  b: FuzzyDate | undefined,
): boolean {
  if (a === undefined && b === undefined) return true
  if (a === undefined || b === undefined) return false
  return JSON.stringify(a) === JSON.stringify(b)
}

/** フォームのローカル状態(編集中の入力値)一式 */
interface FormFields {
  surname: string
  given: string
  surnameKana: string
  givenKana: string
  gender: Gender
  birthDate: FuzzyDate | undefined
  birthPlace: string
  deathDate: FuzzyDate | undefined
  deathPlace: string
  note: string
}

/** personの編集対象フィールドをフォームのローカル状態表現へ落とす */
function fieldsFromPerson(person: Person): FormFields {
  return {
    surname: person.name.surname ?? '',
    given: person.name.given ?? '',
    surnameKana: person.name.surnameKana ?? '',
    givenKana: person.name.givenKana ?? '',
    gender: person.gender,
    birthDate: person.birth?.date,
    birthPlace: person.birth?.place ?? '',
    deathDate: person.death?.date,
    deathPlace: person.death?.place ?? '',
    note: person.note ?? '',
  }
}

/** フォーム入力値とpersonの内容が一致しているか(=非ダーティか) */
function fieldsMatchPerson(fields: FormFields, person: Person): boolean {
  const p = fieldsFromPerson(person)
  return (
    fields.surname === p.surname &&
    fields.given === p.given &&
    fields.surnameKana === p.surnameKana &&
    fields.givenKana === p.givenKana &&
    fields.gender === p.gender &&
    fuzzyDateEqual(fields.birthDate, p.birthDate) &&
    fields.birthPlace === p.birthPlace &&
    fuzzyDateEqual(fields.deathDate, p.deathDate) &&
    fields.deathPlace === p.deathPlace &&
    fields.note === p.note
  )
}

/**
 * 人物情報の編集フォーム(氏名・ふりがな・性別・生没イベント・メモ)。
 * 変更は「確定」操作でまとめて反映する(spec tree-editor)。
 */
export function PersonEditForm({
  person,
  onSave,
  onDirtyChange,
  formRef,
}: PersonEditFormProps) {
  const [surname, setSurname] = useState(person.name.surname ?? '')
  const [given, setGiven] = useState(person.name.given ?? '')
  const [surnameKana, setSurnameKana] = useState(person.name.surnameKana ?? '')
  const [givenKana, setGivenKana] = useState(person.name.givenKana ?? '')
  const [gender, setGender] = useState<Gender>(person.gender)
  const [birthDate, setBirthDate] = useState<FuzzyDate | undefined>(
    person.birth?.date,
  )
  const [birthPlace, setBirthPlace] = useState(person.birth?.place ?? '')
  const [deathDate, setDeathDate] = useState<FuzzyDate | undefined>(
    person.death?.date,
  )
  const [deathPlace, setDeathPlace] = useState(person.death?.place ?? '')
  const [note, setNote] = useState(person.note ?? '')
  const genderId = useId()
  const birthPlaceId = useId()
  const deathPlaceId = useId()
  const noteId = useId()

  const fields: FormFields = {
    surname,
    given,
    surnameKana,
    givenKana,
    gender,
    birthDate,
    birthPlace,
    deathDate,
    deathPlace,
    note,
  }

  /** 最後にローカル状態の同期元にしたperson(マウント時の初期値、または追随済みのperson) */
  const lastSyncedPersonRef = useRef(person)

  /*
   * personプロパティの内容変化(undo/redo・外部更新)へのローカル状態の同期(監査 中4)。
   * これが無いと、undoでpersonが巻き戻ってもフォームは古い入力値のまま残り、
   * 「何もしていないのに保存されていない変更があります」(偽ダーティ)や
   * 「保存して移動でundo前の値が再保存され、undoが巻き戻る」問題が起きる。
   *
   * 同期の方針:
   * - 入力値が新しいpersonと既に一致している(確定操作のラウンドトリップ)なら何もしない
   * - 非ダーティ(入力値が前回同期したpersonと一致)なら、新しいpersonの内容へ追随する
   * - ダーティの最中にpersonが変わった場合は、利用者の入力を消さないことを優先して
   *   同期せずダーティのまま維持する(入力値と現personの差分はダーティ通知エフェクトが検出する)
   */
  useEffect(() => {
    const prev = lastSyncedPersonRef.current
    if (person === prev) return
    if (fieldsMatchPerson(fields, person)) {
      // 確定のラウンドトリップ等: 入力はそのまま同期済みとみなす
      lastSyncedPersonRef.current = person
      return
    }
    if (!fieldsMatchPerson(fields, prev)) {
      // 編集中(ダーティ)。入力値は保持し、personだけが変わった事実はダーティ判定に委ねる
      return
    }
    lastSyncedPersonRef.current = person
    const next = fieldsFromPerson(person)
    setSurname(next.surname)
    setGiven(next.given)
    setSurnameKana(next.surnameKana)
    setGivenKana(next.givenKana)
    setGender(next.gender)
    setBirthDate(next.birthDate)
    setBirthPlace(next.birthPlace)
    setDeathDate(next.deathDate)
    setDeathPlace(next.deathPlace)
    setNote(next.note)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person])

  useEffect(() => {
    onDirtyChange?.(!fieldsMatchPerson(fields, person))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    surname,
    given,
    surnameKana,
    givenKana,
    gender,
    birthDate,
    birthPlace,
    deathDate,
    deathPlace,
    note,
    person,
  ])

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
          ? {
              type: 'birth',
              ...(birthDate && { date: birthDate }),
              ...(birthPlace.trim() && { place: birthPlace.trim() }),
            }
          : undefined,
      death:
        deathDate || deathPlace.trim()
          ? {
              type: 'death',
              ...(deathDate && { date: deathDate }),
              ...(deathPlace.trim() && { place: deathPlace.trim() }),
            }
          : undefined,
      note: note.trim() || undefined,
    })
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="person-edit-form surface--sunken"
    >
      <PersonNameFields
        surname={surname}
        given={given}
        onSurnameChange={setSurname}
        onGivenChange={setGiven}
      />
      <div className="person-edit-form-kana-fields">
        <label className="field-label">
          姓(ふりがな)
          <input
            className="field field--block"
            type="text"
            value={surnameKana}
            onChange={(e) => setSurnameKana(e.target.value)}
            placeholder="やまだ"
          />
        </label>
        <label className="field-label">
          名(ふりがな)
          <input
            className="field field--block"
            type="text"
            value={givenKana}
            onChange={(e) => setGivenKana(e.target.value)}
            placeholder="たろう"
          />
        </label>
      </div>

      <label htmlFor={genderId} className="person-edit-form-field field-label">
        性別
        <select
          id={genderId}
          className="field field--block"
          value={gender}
          onChange={(e) => setGender(e.target.value as Gender)}
        >
          {(Object.keys(GENDER_LABEL) as Gender[]).map((g) => (
            <option key={g} value={g}>
              {GENDER_LABEL[g]}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="person-edit-form-event surface--fieldset">
        <legend>生年月日</legend>
        <WarekiDateInput
          label="生年月日"
          hideLabel
          value={birthDate}
          onChange={setBirthDate}
        />
        <label
          htmlFor={birthPlaceId}
          className="person-edit-form-field field-label"
        >
          場所
          <input
            id={birthPlaceId}
            className="field field--block"
            type="text"
            value={birthPlace}
            onChange={(e) => setBirthPlace(e.target.value)}
          />
        </label>
      </fieldset>

      <fieldset className="person-edit-form-event surface--fieldset">
        <legend>没年月日</legend>
        <WarekiDateInput
          label="没年月日"
          hideLabel
          value={deathDate}
          onChange={setDeathDate}
        />
        <label
          htmlFor={deathPlaceId}
          className="person-edit-form-field field-label"
        >
          場所
          <input
            id={deathPlaceId}
            className="field field--block"
            type="text"
            value={deathPlace}
            onChange={(e) => setDeathPlace(e.target.value)}
          />
        </label>
      </fieldset>

      <label htmlFor={noteId} className="person-edit-form-field field-label">
        メモ
        <textarea
          id={noteId}
          className="field field--block"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
        />
      </label>

      <button
        type="submit"
        className="btn btn--primary-soft person-edit-form-submit"
      >
        確定
      </button>
    </form>
  )
}

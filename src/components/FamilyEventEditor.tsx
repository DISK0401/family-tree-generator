import { useId, useState } from 'react'
import { setFamilyEvent } from '../domain/commands'
import { displayName } from '../domain/helpers'
import type { Family, FamilyEventType, FamilyId, LifeEvent, PersonId, TreeDocument } from '../domain/types'
import { useTreeStore } from '../store/tree-store'
import { WarekiDateInput } from './WarekiDateInput'
import './FamilyEventEditor.css'

interface FamilyEventEditorProps {
  personId: PersonId
}

function spouseNames(doc: TreeDocument, family: Family, excludeId: PersonId): string {
  const others = family.spouseIds.filter((id) => id !== excludeId)
  const names = others.map((id) => (doc.persons[id] ? displayName(doc.persons[id]) : '(不明)'))
  return names.length > 0 ? names.join('・') : '(配偶者未登録)'
}

interface EventFieldsProps {
  familyId: FamilyId
  type: FamilyEventType
  label: string
  event: LifeEvent<FamilyEventType> | undefined
  /** 種別ごとの2件目以降(復縁等)の件数。このUIでは編集対象にしない(design.md Non-Goal) */
  extraCount: number
}

/**
 * 婚姻日・離婚日1組分の入力欄。ローカル状態で編集内容を保持し、フォーカスが外れた時点で
 * `setFamilyEvent`を適用する(spec tree-editor「即時反映(確定操作不要)」)。
 * `PersonEditForm`のような確定ボタン+離脱確認は設けない(design.md D1)。
 * 呼び出し側が`event`の内容をkeyに含めてマウントすることで、保存後・undo/redo後の
 * 最新値への追従をエフェクトではなく再マウントで行う(react-hooks/set-state-in-effect対応)
 */
function EventFields({ familyId, type, label, event, extraCount }: EventFieldsProps) {
  const apply = useTreeStore((s) => s.apply)
  const [date, setDate] = useState(event?.date)
  const [place, setPlace] = useState(event?.place ?? '')
  const placeId = useId()

  function commit() {
    const trimmedPlace = place.trim()
    apply((doc) =>
      setFamilyEvent(
        doc,
        familyId,
        type,
        date || trimmedPlace
          ? { type, ...(date && { date }), ...(trimmedPlace && { place: trimmedPlace }) }
          : undefined,
      ),
    )
  }

  return (
    <fieldset className="family-event-editor-event" onBlur={commit}>
      <legend>{label}</legend>
      <WarekiDateInput label={label} hideLabel value={date} onChange={setDate} />
      <label htmlFor={placeId} className="family-event-editor-field">
        場所
        <input id={placeId} type="text" value={place} onChange={(e) => setPlace(e.target.value)} />
      </label>
      {extraCount > 0 && (
        <p className="family-event-editor-note">
          他に{extraCount}件の{label}イベントがあります(このUIでは編集できませんが、データは保持されます)
        </p>
      )}
    </fieldset>
  )
}

/**
 * 選択中人物が配偶者として属する家族(Family)ごとの婚姻日・離婚日編集(spec tree-editor)。
 * 続柄編集(PedigreeEditor)と同じく、PersonEditFormのダーティ追跡・離脱確認の対象外とする。
 */
export function FamilyEventEditor({ personId }: FamilyEventEditorProps) {
  const document = useTreeStore((s) => s.document)

  const families = Object.values(document.families).filter((f) => f.spouseIds.includes(personId))
  if (families.length === 0) return null

  return (
    <div className="family-event-editor">
      <h3 className="family-event-editor-title">婚姻・離婚</h3>
      {families.map((family) => {
        const marriageEvents = family.events.filter((e) => e.type === 'marriage')
        const divorceEvents = family.events.filter((e) => e.type === 'divorce')
        return (
          <div key={family.id} className="family-event-editor-family">
            <p className="family-event-editor-spouse">{spouseNames(document, family, personId)}</p>
            <EventFields
              key={`marriage:${JSON.stringify(marriageEvents[0] ?? null)}`}
              familyId={family.id}
              type="marriage"
              label="婚姻日"
              event={marriageEvents[0]}
              extraCount={Math.max(0, marriageEvents.length - 1)}
            />
            <EventFields
              key={`divorce:${JSON.stringify(divorceEvents[0] ?? null)}`}
              familyId={family.id}
              type="divorce"
              label="離婚日"
              event={divorceEvents[0]}
              extraCount={Math.max(0, divorceEvents.length - 1)}
            />
          </div>
        )
      })}
    </div>
  )
}

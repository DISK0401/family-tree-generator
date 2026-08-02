import {
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from 'react'
import {
  addSpouseLink,
  removeFamily,
  setFamilyEvent,
} from '../../domain/commands'
import { displayName } from '../../domain/helpers'
import type {
  Family,
  FamilyEventType,
  FamilyId,
  LifeEvent,
  Person,
  PersonId,
  TreeDocument,
} from '../../domain/types'
import { useTreeStore } from '../../store/tree-store'
import { ConfirmDialog } from '../../molecules/ConfirmDialog'
import { PersonPicker } from '../../molecules/PersonPicker'
import { UnlinkRelationControl } from './UnlinkRelationControl'
import { WarekiDateInput } from '../../molecules/WarekiDateInput'
import './FamilyEventEditor.css'
import { Button } from '../../atoms/Button'

interface FamilyEventEditorProps {
  personId: PersonId
}

function spouseNames(
  doc: TreeDocument,
  family: Family,
  excludeId: PersonId,
): string {
  const others = family.spouseIds.filter((id) => id !== excludeId)
  const names = others.map((id) =>
    doc.persons[id] ? displayName(doc.persons[id]) : '(不明)',
  )
  return names.length > 0 ? names.join('・') : '(配偶者未登録)'
}

/**
 * その家族の2人目の配偶者になれる人物。自分自身・既に配偶者の人物に加え、
 * その家族の子を除く(自分自身の親にはなれないため。spec tree-editor)
 */
function spouseCandidates(
  doc: TreeDocument,
  family: Family,
  personId: PersonId,
): Person[] {
  const excluded = new Set<PersonId>([
    personId,
    ...family.spouseIds,
    ...family.children.map((c) => c.childId),
  ])
  return Object.values(doc.persons).filter((p) => !excluded.has(p.id))
}

/**
 * 配偶者が登録されていない家族へ、既存の人物を配偶者として紐づける。
 * 親子関係と婚姻関係が別々の家族に分かれて記録された状態を、利用者が明示的に統合するための導線
 * (design.md D5/D6)。`PedigreeEditor`と同じ行内`<select>`で、選択と同時に即時反映する
 */
function SpouseLinkField({
  family,
  personId,
}: {
  family: Family
  personId: PersonId
}) {
  const document = useTreeStore((s) => s.document)
  const apply = useTreeStore((s) => s.apply)
  const pickerId = useId()

  const candidates = spouseCandidates(document, family, personId)
  if (candidates.length === 0) return null

  return (
    <label htmlFor={pickerId} className="family-event-editor-link field-label">
      配偶者に既存の人物を設定
      <PersonPicker
        id={pickerId}
        candidates={candidates}
        onSelect={(spouseId) =>
          apply((doc) => addSpouseLink(doc, family.id, spouseId))
        }
      />
    </label>
  )
}

/**
 * 家族(婚姻単位)そのものの削除。人物削除と同様、失われる内容を提示して確認を求める
 * (spec tree-editor「婚姻単位の削除」)。人物は削除しない
 */
function FamilyDeleteControl({ family }: { family: Family }) {
  const apply = useTreeStore((s) => s.apply)
  const [open, setOpen] = useState(false)

  const eventCount = family.events.length
  const childCount = family.children.length

  return (
    <>
      <Button
        variant="text"
        className="family-event-editor-delete"
        onClick={() => setOpen(true)}
      >
        この婚姻を削除
      </Button>
      {open && (
        <ConfirmDialog
          title="この婚姻を削除しますか？"
          alertdialog
          confirmLabel="削除する"
          confirmDanger
          onConfirm={() => {
            apply((doc) => removeFamily(doc, family.id))
            setOpen(false)
          }}
          onCancel={() => setOpen(false)}
        >
          <p>
            {[
              eventCount > 0 && `婚姻・離婚の記録${eventCount}件`,
              childCount > 0 && `子${childCount}人の親としての帰属`,
            ]
              .filter(Boolean)
              .join('・') || '記録されている婚姻・離婚の日付や子はありません。'}
            {(eventCount > 0 || childCount > 0) && 'が失われます。'}
            人物そのものは削除されません。削除後すぐであれば「元に戻す」で復元できます。
          </p>
        </ConfirmDialog>
      )}
    </>
  )
}

interface EventFieldsProps {
  familyId: FamilyId
  type: FamilyEventType
  label: string
  event: LifeEvent<FamilyEventType> | undefined
  /** 種別ごとの2件目以降(復縁等)の件数。このUIでは編集対象にしない(design.md Non-Goal) */
  extraCount: number
}

/** イベントの同値比較。undefined同士も等しいとみなす(無変更commitのスキップ判定に使う) */
function eventsEqual(
  a: LifeEvent<FamilyEventType> | undefined,
  b: LifeEvent<FamilyEventType> | undefined,
): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

/**
 * 婚姻日・離婚日1組分の入力欄。ローカル状態で編集内容を保持し、フォーカスがfieldsetの外へ
 * 出た時点で`setFamilyEvent`を適用する(spec tree-editor「即時反映(確定操作不要)」)。
 * `PersonEditForm`のような確定ボタン+離脱確認は設けない(design.md D1)。
 *
 * 監査 高2 の3点:
 * - commit前に現在の`event`と構築結果を同値比較し、無変更なら`apply`しない
 *   (`setFamilyEvent`はtouchで新参照を返すため、ストア側のno-op検知では止まらず
 *   履歴と更新日時だけが動いてしまう。UI側の同値スキップが必須)
 * - fieldset内のフォーカス移動(日付→場所欄など)ではcommitしない
 *   (`relatedTarget`がfieldset内なら離脱ではない)
 * - undo/redo等で`event`プロパティが変わったときは、再マウント(旧実装のkey方式)ではなく
 *   ローカル状態への同期エフェクトで追随する(編集中のフォーカスを失わない)。
 *   同期は「最後に同期/commitしたイベントのスナップショット」と異なるときのみ行う
 */
function EventFields({
  familyId,
  type,
  label,
  event,
  extraCount,
}: EventFieldsProps) {
  const apply = useTreeStore((s) => s.apply)
  const [date, setDate] = useState(event?.date)
  const [place, setPlace] = useState(event?.place ?? '')
  const placeId = useId()
  /** 最後に同期またはcommitしたイベント。これと異なるevent到来 = 外部変更(undo/redo) */
  const lastSyncedEventRef = useRef(event)

  useEffect(() => {
    if (eventsEqual(event, lastSyncedEventRef.current)) return
    lastSyncedEventRef.current = event
    setDate(event?.date)
    setPlace(event?.place ?? '')
  }, [event])

  function buildEvent(): LifeEvent<FamilyEventType> | undefined {
    const trimmedPlace = place.trim()
    return date || trimmedPlace
      ? {
          type,
          ...(date && { date }),
          ...(trimmedPlace && { place: trimmedPlace }),
        }
      : undefined
  }

  function commit() {
    const next = buildEvent()
    // 無変更のcommit(単なるフォーカス通過等)は履歴を積まない
    if (eventsEqual(next, event)) return
    lastSyncedEventRef.current = next
    apply((doc) => setFamilyEvent(doc, familyId, type, next))
  }

  function handleBlur(e: FocusEvent<HTMLFieldSetElement>) {
    // fieldset内のフォーカス移動(日付→場所へのTab等)はまだ編集の途中。commitしない
    if (e.currentTarget.contains(e.relatedTarget)) return
    commit()
  }

  function handleKeyDown(e: KeyboardEvent<HTMLFieldSetElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    commit()
  }

  return (
    <fieldset
      className="family-event-editor-event surface--fieldset"
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    >
      <legend>{label}</legend>
      <WarekiDateInput
        label={label}
        hideLabel
        value={date}
        onChange={setDate}
      />
      <label
        htmlFor={placeId}
        className="family-event-editor-field field-label"
      >
        場所
        <input
          id={placeId}
          className="field field--block"
          type="text"
          value={place}
          onChange={(e) => setPlace(e.target.value)}
        />
      </label>
      {extraCount > 0 && (
        <p className="family-event-editor-note">
          他に{extraCount}件の{label}
          イベントがあります(このUIでは編集できませんが、データは保持されます)
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

  const families = Object.values(document.families).filter((f) =>
    f.spouseIds.includes(personId),
  )
  if (families.length === 0) return null

  return (
    <div className="family-event-editor">
      <h3 className="family-event-editor-title">婚姻・離婚</h3>
      {families.map((family) => {
        const marriageEvents = family.events.filter(
          (e) => e.type === 'marriage',
        )
        const divorceEvents = family.events.filter((e) => e.type === 'divorce')
        const hasOtherSpouse = family.spouseIds.some((id) => id !== personId)
        return (
          <div key={family.id} className="family-event-editor-family">
            <p className="family-event-editor-spouse">
              {spouseNames(document, family, personId)}
            </p>
            {!hasOtherSpouse && (
              <SpouseLinkField family={family} personId={personId} />
            )}
            <EventFields
              familyId={family.id}
              type="marriage"
              label="婚姻日"
              event={marriageEvents[0]}
              extraCount={Math.max(0, marriageEvents.length - 1)}
            />
            <EventFields
              familyId={family.id}
              type="divorce"
              label="離婚日"
              event={divorceEvents[0]}
              extraCount={Math.max(0, divorceEvents.length - 1)}
            />
            <div className="family-event-editor-controls">
              {/* 家族そのものは残したまま、自分だけ配偶者から外す。子の帰属や婚姻の記録が
                  正しく、配偶者の紐づけだけを誤った場合に使う(spec tree-editor
                  「関係リンクの解除」)。家族ごと消す「この婚姻を削除」とは別の操作 */}
              <UnlinkRelationControl
                familyId={family.id}
                kind="spouse"
                personId={personId}
                label="この家族から自分を外す"
                title="この家族の配偶者から外れますか？"
              />
              <FamilyDeleteControl family={family} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

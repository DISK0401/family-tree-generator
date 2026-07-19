import { useId } from 'react'
import { useDisplaySettingsStore } from './display-settings-store'
import type { CalendarMode, CardFieldVisibility, DateGranularity } from './display-settings'
import './DisplaySettingsControl.css'

const GRANULARITY_LABEL: Record<DateGranularity, string> = {
  year: '年のみ',
  'year-month': '年月まで',
  full: '年月日まで',
}

const CALENDAR_MODE_LABEL: Record<CalendarMode, string> = {
  gregorian: '西暦',
  wareki: '和暦',
}

const CARD_FIELD_LABEL: Record<keyof CardFieldVisibility, string> = {
  surname: '姓',
  given: '名',
  furigana: 'ふりがな',
  birthDate: '生年月日',
  deathDate: '没年月日',
  birthPlace: '出生地',
  deathPlace: '没地',
  age: '年齢',
  genderIcon: '性別アイコン',
}
const CARD_FIELD_KEYS = Object.keys(CARD_FIELD_LABEL) as (keyof CardFieldVisibility)[]

/**
 * 生年月日・没年月日をカードに表示する粒度を選ぶ設定(design.md D9)。
 * 家系図データではなく端末ローカルのUI設定のため、設定メニュー内に置く。
 */
export function DisplaySettingsControl() {
  const birthDateGranularity = useDisplaySettingsStore((s) => s.birthDateGranularity)
  const deathDateGranularity = useDisplaySettingsStore((s) => s.deathDateGranularity)
  const calendarMode = useDisplaySettingsStore((s) => s.calendarMode)
  const visibleCardFields = useDisplaySettingsStore((s) => s.visibleCardFields)
  const showMarriageDateOnLink = useDisplaySettingsStore((s) => s.showMarriageDateOnLink)
  const setBirthDateGranularity = useDisplaySettingsStore((s) => s.setBirthDateGranularity)
  const setDeathDateGranularity = useDisplaySettingsStore((s) => s.setDeathDateGranularity)
  const setCalendarMode = useDisplaySettingsStore((s) => s.setCalendarMode)
  const setVisibleCardField = useDisplaySettingsStore((s) => s.setVisibleCardField)
  const setShowMarriageDateOnLink = useDisplaySettingsStore((s) => s.setShowMarriageDateOnLink)
  const birthId = useId()
  const deathId = useId()
  const calendarModeId = useId()
  const cardFieldsGroupId = useId()

  return (
    <div className="display-settings-control">
      <p className="display-settings-control-heading">カードの表示</p>
      <label htmlFor={calendarModeId} className="display-settings-control-field">
        表示形式
        <select
          id={calendarModeId}
          value={calendarMode}
          onChange={(e) => setCalendarMode(e.target.value as CalendarMode)}
        >
          {(Object.keys(CALENDAR_MODE_LABEL) as CalendarMode[]).map((m) => (
            <option key={m} value={m}>
              {CALENDAR_MODE_LABEL[m]}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor={birthId} className="display-settings-control-field">
        生年月日
        <select
          id={birthId}
          value={birthDateGranularity}
          onChange={(e) => setBirthDateGranularity(e.target.value as DateGranularity)}
        >
          {(Object.keys(GRANULARITY_LABEL) as DateGranularity[]).map((g) => (
            <option key={g} value={g}>
              {GRANULARITY_LABEL[g]}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor={deathId} className="display-settings-control-field">
        没年月日
        <select
          id={deathId}
          value={deathDateGranularity}
          onChange={(e) => setDeathDateGranularity(e.target.value as DateGranularity)}
        >
          {(Object.keys(GRANULARITY_LABEL) as DateGranularity[]).map((g) => (
            <option key={g} value={g}>
              {GRANULARITY_LABEL[g]}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="display-settings-control-card-fields">
        <legend id={cardFieldsGroupId}>表示する項目</legend>
        {CARD_FIELD_KEYS.map((field) => (
          <label key={field} className="display-settings-control-checkbox">
            <input
              type="checkbox"
              checked={visibleCardFields[field]}
              onChange={(e) => setVisibleCardField(field, e.target.checked)}
            />
            {CARD_FIELD_LABEL[field]}
          </label>
        ))}
        {!visibleCardFields.surname && !visibleCardFields.given && (
          <p className="display-settings-control-warning">
            姓・名をどちらも非表示にすると、カード上でその人物を識別する手がかりがなくなります。
          </p>
        )}
        <label className="display-settings-control-checkbox">
          <input
            type="checkbox"
            checked={showMarriageDateOnLink}
            onChange={(e) => setShowMarriageDateOnLink(e.target.checked)}
          />
          婚姻日(線)
        </label>
      </fieldset>
    </div>
  )
}

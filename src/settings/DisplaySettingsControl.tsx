import { useId } from 'react'
import { useDisplaySettingsStore } from './display-settings-store'
import type { DateGranularity } from './display-settings'
import './DisplaySettingsControl.css'

const GRANULARITY_LABEL: Record<DateGranularity, string> = {
  year: '年のみ',
  'year-month': '年月まで',
  full: '年月日まで',
}

/**
 * 生年月日・没年月日をカードに表示する粒度を選ぶ設定(design.md D9)。
 * 家系図データではなく端末ローカルのUI設定のため、設定メニュー内に置く。
 */
export function DisplaySettingsControl() {
  const birthDateGranularity = useDisplaySettingsStore((s) => s.birthDateGranularity)
  const deathDateGranularity = useDisplaySettingsStore((s) => s.deathDateGranularity)
  const setBirthDateGranularity = useDisplaySettingsStore((s) => s.setBirthDateGranularity)
  const setDeathDateGranularity = useDisplaySettingsStore((s) => s.setDeathDateGranularity)
  const birthId = useId()
  const deathId = useId()

  return (
    <div className="display-settings-control">
      <p className="display-settings-control-heading">カードの表示</p>
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
    </div>
  )
}

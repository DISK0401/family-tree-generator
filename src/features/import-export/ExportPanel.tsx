import { useState } from 'react'
import type { FamilyTreeData } from '../../domain/model'
import { encodeGedcomTextToBytes, exportGedcom } from '../../lib/gedcom/export'
import type { GedcomVersion } from '../../lib/gedcom/version'
import { exportFamilyTreeJsonText } from '../../lib/json/export'
import { downloadBytes, downloadText } from './fileIO'

type ExportFormat = 'gedcom-7' | 'gedcom-551' | 'json'

const FORMAT_OPTIONS: {
  value: ExportFormat
  label: string
  description: string
}[] = [
  {
    value: 'gedcom-7',
    label: 'GEDCOM 7.0(推奨)',
    description:
      '養子縁組・事実婚など複雑な家族関係まで表現できる最新規格です。',
  },
  {
    value: 'gedcom-551',
    label: 'GEDCOM 5.5.1互換',
    description: '他の家系図サービスへの取り込みに適した従来規格です。',
  },
  {
    value: 'json',
    label: 'JSON(完全バックアップ)',
    description:
      'このアプリの全データをロスレスに保存します。復元にはこのアプリを使用してください。',
  },
]

interface ExportPanelProps {
  data: FamilyTreeData
  sourceVersion?: GedcomVersion
}

export function ExportPanel({ data, sourceVersion }: ExportPanelProps) {
  const [format, setFormat] = useState<ExportFormat>('gedcom-7')
  const [warnings, setWarnings] = useState<string[]>([])

  const handleExport = () => {
    if (format === 'json') {
      const text = exportFamilyTreeJsonText(data)
      downloadText(text, 'family-tree.json', 'application/json')
      setWarnings([])
      return
    }

    const version: GedcomVersion = format === 'gedcom-7' ? '7.0' : '5.5.1'
    const { text, warnings: exportWarnings } = exportGedcom(
      data,
      version,
      sourceVersion,
    )
    downloadBytes(
      encodeGedcomTextToBytes(text),
      version === '7.0' ? 'family-tree.ged' : 'family-tree-5.5.1.ged',
      'text/vnd.familysearch.gedcom',
    )
    setWarnings(exportWarnings)
  }

  return (
    <section className="export-panel">
      <h2>データを書き出す</h2>
      <fieldset>
        <legend>形式を選択</legend>
        {FORMAT_OPTIONS.map((option) => (
          <label key={option.value} className="export-panel__option">
            <input
              type="radio"
              name="export-format"
              value={option.value}
              checked={format === option.value}
              onChange={() => setFormat(option.value)}
            />
            <span>
              <strong>{option.label}</strong>
              <br />
              {option.description}
            </span>
          </label>
        ))}
      </fieldset>
      <p className="export-panel__notice">
        書き出したファイルには家族・親族の氏名や生年月日などの個人情報が含まれます。取り扱いにはご注意ください。
      </p>
      <button
        type="button"
        onClick={handleExport}
        disabled={data.people.length === 0}
      >
        エクスポート
      </button>
      {warnings.length > 0 && (
        <div className="export-panel__warnings" role="alert">
          <p>{warnings.length}件の警告があります:</p>
          <ul>
            {warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

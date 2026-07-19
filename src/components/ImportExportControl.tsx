import { useCallback, useId, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { useTreeStore } from '../store/tree-store'
import type { TreeDocument } from '../domain/types'
import { importGedcom, type ImportWarning } from '../lib/gedcom/import'
import { encodeGedcomTextToBytes, exportGedcom } from '../lib/gedcom/export'
import type { GedcomVersion } from '../lib/gedcom/version'
import type { DetectedEncoding } from '../lib/gedcom/encoding'
import { importFamilyTreeJson } from '../lib/json/import'
import { exportFamilyTreeJsonText } from '../lib/json/export'
import {
  MAX_IMPORT_FILE_SIZE,
  detectFileFormat,
  downloadBytes,
  downloadText,
  formatExportTimestamp,
  readFileAsBytes,
} from '../features/import-export/fileIO'
import './ImportExportControl.css'
import './confirm-dialog.css'

interface ImportSummaryInfo {
  peopleCount: number
  familiesCount: number
  encoding?: DetectedEncoding
  gedcomVersion?: GedcomVersion
  warnings: ImportWarning[]
}

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

const ENCODING_LABEL: Record<string, string> = {
  'utf-8': 'UTF-8',
  'utf-16': 'UTF-16',
  shift_jis: 'Shift_JIS',
}

export function ImportExportControl() {
  const document = useTreeStore((s) => s.document)
  const replace = useTreeStore((s) => s.replace)

  const [open, setOpen] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [importError, setImportError] = useState<string | undefined>()
  const [importSummary, setImportSummary] = useState<
    ImportSummaryInfo | undefined
  >()
  const [pendingImport, setPendingImport] = useState<TreeDocument | undefined>()
  const [exportFormat, setExportFormat] = useState<ExportFormat>('gedcom-7')
  const [exportWarnings, setExportWarnings] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const titleId = useId()

  const personCount = Object.keys(document.persons).length

  function openDialog() {
    setImportError(undefined)
    setImportSummary(undefined)
    setPendingImport(undefined)
    setExportWarnings([])
    setOpen(true)
  }

  function closeDialog() {
    setOpen(false)
  }

  const applyImportedDocument = useCallback(
    (imported: TreeDocument, summary: ImportSummaryInfo) => {
      if (personCount > 0) {
        setPendingImport(imported)
        setImportSummary(summary)
        return
      }
      replace(imported)
      setImportSummary(summary)
    },
    [personCount, replace],
  )

  const handleFile = useCallback(
    async (file: File) => {
      setImportError(undefined)
      setImportSummary(undefined)
      setPendingImport(undefined)

      if (file.size > MAX_IMPORT_FILE_SIZE) {
        setImportError(
          `ファイルサイズが上限(20MB)を超えています(${(file.size / (1024 * 1024)).toFixed(1)}MB)。ファイルを分割するか縮小してからお試しください。`,
        )
        return
      }

      const format = detectFileFormat(file.name)
      if (format === 'unknown') {
        setImportError(
          '対応していないファイル形式です。GEDCOMファイル(.ged)またはJSONファイル(.json)を選択してください。',
        )
        return
      }

      const bytes = await readFileAsBytes(file)

      if (format === 'gedcom') {
        const result = importGedcom(bytes)
        if (!result.success) {
          setImportError(result.reason)
          return
        }
        applyImportedDocument(result.document, {
          peopleCount: Object.keys(result.document.persons).length,
          familiesCount: Object.keys(result.document.families).length,
          encoding: result.encoding,
          gedcomVersion: result.version,
          warnings: result.warnings,
        })
        return
      }

      const text = new TextDecoder('utf-8').decode(bytes)
      const result = importFamilyTreeJson(text)
      if (!result.success) {
        setImportError(result.reason)
        return
      }
      applyImportedDocument(result.document, {
        peopleCount: Object.keys(result.document.persons).length,
        familiesCount: Object.keys(result.document.families).length,
        warnings: [],
      })
    },
    [applyImportedDocument],
  )

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) {
      void handleFile(file)
    }
    event.target.value = ''
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (file) {
      void handleFile(file)
    }
  }

  function confirmOverwrite() {
    if (!pendingImport) {
      return
    }
    replace(pendingImport)
    setPendingImport(undefined)
  }

  function cancelOverwrite() {
    setPendingImport(undefined)
    setImportSummary(undefined)
  }

  function handleExport() {
    // ファイル名にタイムスタンプを付与し、複数回エクスポートしても上書きされないようにする(design.md D10)
    const timestamp = formatExportTimestamp()

    if (exportFormat === 'json') {
      const text = exportFamilyTreeJsonText(document)
      downloadText(text, `family-tree-${timestamp}.json`, 'application/json')
      setExportWarnings([])
      return
    }

    const version: GedcomVersion = exportFormat === 'gedcom-7' ? '7.0' : '5.5.1'
    const { text, warnings } = exportGedcom(document, version)
    downloadBytes(
      encodeGedcomTextToBytes(text),
      version === '7.0' ? `family-tree-${timestamp}.ged` : `family-tree-${timestamp}-5.5.1.ged`,
      'text/vnd.familysearch.gedcom',
    )
    setExportWarnings(warnings)
  }

  return (
    <>
      <button
        type="button"
        className="import-export-trigger"
        onClick={openDialog}
      >
        GEDCOM/JSONの読み込み・書き出し
      </button>
      {open && (
        <div className="confirm-dialog-overlay">
          <div
            className="confirm-dialog import-export-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <h2 id={titleId}>GEDCOM/JSONの読み込み・書き出し</h2>

            <section className="import-export-section">
              <h3>読み込む</h3>
              <div
                className={
                  isDragging
                    ? 'import-dropzone import-dropzone--active'
                    : 'import-dropzone'
                }
                onDragOver={(event) => {
                  event.preventDefault()
                  setIsDragging(true)
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    inputRef.current?.click()
                  }
                }}
              >
                <p>
                  GEDCOM(.ged)またはJSON(.json)ファイルをドラッグ&ドロップ、
                  またはクリックして選択してください。
                </p>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".ged,.gedcom,.json"
                  aria-label="家系図ファイルを選択"
                  onChange={handleInputChange}
                  className="import-dropzone__input"
                />
              </div>

              {importError && (
                <p role="alert" className="import-export-error">
                  {importError}
                </p>
              )}

              {pendingImport && importSummary && (
                <div
                  className="import-export-confirm"
                  role="alertdialog"
                  aria-modal="true"
                >
                  <p>
                    現在の家系図(人物 {personCount}名)を、読み込んだデータ(人物{' '}
                    {importSummary.peopleCount}名・家族{' '}
                    {importSummary.familiesCount}件)で
                    置き換えます。この操作は取り消せません。続行しますか?
                  </p>
                  <div className="confirm-dialog-actions">
                    <button type="button" onClick={cancelOverwrite}>
                      キャンセル
                    </button>
                    <button
                      type="button"
                      className="confirm-dialog-danger-button"
                      onClick={confirmOverwrite}
                    >
                      置き換える
                    </button>
                  </div>
                </div>
              )}

              {importSummary && !pendingImport && (
                <div className="import-export-summary" aria-live="polite">
                  <p>
                    人物 {importSummary.peopleCount}名・家族{' '}
                    {importSummary.familiesCount}
                    件を読み込みました。
                    {importSummary.gedcomVersion && (
                      <>
                        {' '}
                        (GEDCOM {importSummary.gedcomVersion}
                        {importSummary.encoding &&
                          `、文字コード: ${ENCODING_LABEL[importSummary.encoding] ?? importSummary.encoding}として読み込み`}
                        )
                      </>
                    )}
                  </p>
                  {importSummary.warnings.length > 0 ? (
                    <div className="import-export-warnings">
                      <p>{importSummary.warnings.length}件の警告があります:</p>
                      <ul>
                        {importSummary.warnings.map((warning, index) => (
                          <li key={index}>
                            {warning.lineNumber !== undefined &&
                              `${warning.lineNumber}行目: `}
                            {warning.tag && `[${warning.tag}] `}
                            {warning.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p>警告はありません。</p>
                  )}
                </div>
              )}
            </section>

            <section className="import-export-section">
              <h3>書き出す</h3>
              <fieldset className="import-export-format-fieldset">
                <legend>形式を選択</legend>
                {FORMAT_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className="import-export-format-option"
                  >
                    <input
                      type="radio"
                      name="export-format"
                      value={option.value}
                      checked={exportFormat === option.value}
                      onChange={() => setExportFormat(option.value)}
                    />
                    <span>
                      <strong>{option.label}</strong>
                      <br />
                      {option.description}
                    </span>
                  </label>
                ))}
              </fieldset>
              <p className="import-export-notice">
                書き出したファイルには家族・親族の氏名や生年月日などの個人情報が含まれます。取り扱いにはご注意ください。
              </p>
              <button
                type="button"
                onClick={handleExport}
                disabled={personCount === 0}
              >
                エクスポート
              </button>
              {exportWarnings.length > 0 && (
                <div className="import-export-warnings" role="alert">
                  <p>{exportWarnings.length}件の警告があります:</p>
                  <ul>
                    {exportWarnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <div className="confirm-dialog-actions">
              <button type="button" onClick={closeDialog}>
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

import { useCallback, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import type { FamilyTreeData } from '../../domain/model'
import { importGedcom, type ImportWarning } from '../../lib/gedcom/import'
import type { DetectedEncoding } from '../../lib/gedcom/encoding'
import type { GedcomVersion } from '../../lib/gedcom/version'
import { importFamilyTreeJson } from '../../lib/json/import'
import {
  MAX_IMPORT_FILE_SIZE,
  detectFileFormat,
  readFileAsBytes,
} from './fileIO'

export interface ImportSummaryInfo {
  format: 'gedcom' | 'json'
  peopleCount: number
  familiesCount: number
  encoding?: DetectedEncoding
  gedcomVersion?: GedcomVersion
  warnings: ImportWarning[]
}

interface ImportPanelProps {
  onImported: (data: FamilyTreeData, summary: ImportSummaryInfo) => void
}

function formatMegabytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1)
}

export function ImportPanel({ onImported }: ImportPanelProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(
    async (file: File) => {
      setError(undefined)

      if (file.size > MAX_IMPORT_FILE_SIZE) {
        setError(
          `ファイルサイズが上限(20MB)を超えています(${formatMegabytes(file.size)}MB)。ファイルを分割するか縮小してからお試しください。`,
        )
        return
      }

      const format = detectFileFormat(file.name)
      if (format === 'unknown') {
        setError(
          '対応していないファイル形式です。GEDCOMファイル(.ged)またはJSONファイル(.json)を選択してください。',
        )
        return
      }

      const bytes = await readFileAsBytes(file)

      if (format === 'gedcom') {
        const result = importGedcom(bytes)
        if (!result.success) {
          setError(result.reason)
          return
        }
        onImported(result.data, {
          format: 'gedcom',
          peopleCount: result.data.people.length,
          familiesCount: result.data.families.length,
          encoding: result.encoding,
          gedcomVersion: result.version,
          warnings: result.warnings,
        })
        return
      }

      const text = new TextDecoder('utf-8').decode(bytes)
      const result = importFamilyTreeJson(text)
      if (!result.success) {
        setError(result.reason)
        return
      }
      onImported(result.data, {
        format: 'json',
        peopleCount: result.data.people.length,
        familiesCount: result.data.families.length,
        warnings: [],
      })
    },
    [onImported],
  )

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      void handleFile(file)
    }
    event.target.value = ''
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (file) {
      void handleFile(file)
    }
  }

  return (
    <section className="import-panel">
      <h2>データを読み込む</h2>
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
          GEDCOM(.ged)またはJSON(.json)ファイルをドラッグ&ドロップ、または
          クリックして選択してください。
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
      {error && (
        <p role="alert" className="import-panel__error">
          {error}
        </p>
      )}
    </section>
  )
}

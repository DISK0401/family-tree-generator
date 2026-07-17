import { useState } from 'react'
import './App.css'
import { createEmptyFamilyTreeData, type FamilyTreeData } from './domain/model'
import type { GedcomVersion } from './lib/gedcom/version'
import {
  ImportPanel,
  type ImportSummaryInfo,
} from './features/import-export/ImportPanel'
import { ImportSummary } from './features/import-export/ImportSummary'
import { ExportPanel } from './features/import-export/ExportPanel'

function App() {
  const [data, setData] = useState<FamilyTreeData>(createEmptyFamilyTreeData())
  const [summary, setSummary] = useState<ImportSummaryInfo | undefined>()

  const handleImported = (
    importedData: FamilyTreeData,
    importSummary: ImportSummaryInfo,
  ) => {
    setData(importedData)
    setSummary(importSummary)
  }

  const sourceVersion: GedcomVersion | undefined =
    summary?.format === 'gedcom' ? summary.gedcomVersion : undefined

  return (
    <main className="app">
      <h1>家系図作成サービス</h1>
      <p>GEDCOM・JSON形式で家系図データをインポート・エクスポートできます。</p>
      <ImportPanel onImported={handleImported} />
      {summary && <ImportSummary summary={summary} />}
      <ExportPanel data={data} sourceVersion={sourceVersion} />
    </main>
  )
}

export default App

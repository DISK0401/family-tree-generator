import { useState } from 'react'
import './App.css'
import { DataResetControl } from './components/DataResetControl'
import { EmptyStateGuide } from './components/EmptyStateGuide'
import { usePersistedTree, type PersistenceStatus } from './persistence/use-persisted-tree'
import { FamilyTreeCanvas } from './rendering/FamilyTreeCanvas'
import { useTreeStore } from './store/tree-store'

function saveStatusText(status: PersistenceStatus): string {
  switch (status.phase) {
    case 'loading':
      return '読み込み中…'
    case 'blocked':
      return `新しいバージョンのデータのため読み込めません(保存データ v${status.storedVersion} / このアプリ v${status.currentVersion})`
    case 'ready':
      switch (status.saveState) {
        case 'idle':
          return 'この端末にのみ保存されます'
        case 'saving':
          return '保存中…'
        case 'saved':
          return '保存済み(この端末にのみ保存されます)'
      }
  }
}

function App() {
  const { status, resetAllData } = usePersistedTree()
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null)
  const personCount = useTreeStore((s) => Object.keys(s.document.persons).length)
  const blocked = status.phase === 'blocked'
  const ready = status.phase === 'ready'
  const empty = ready && personCount === 0

  return (
    <div className="app-frame">
      <header className="app-header">
        <h1 className="app-title">家系図</h1>
        <div className="app-header-right">
          <p className="app-header-status" aria-live="polite">
            {saveStatusText(status)}
          </p>
          <DataResetControl onReset={resetAllData} />
        </div>
      </header>
      <main className="app-canvas" aria-label="家系図キャンバス">
        {blocked ? (
          <p className="app-blocked-message" role="alert">
            {saveStatusText(status)}
          </p>
        ) : null}
        {empty ? <EmptyStateGuide /> : null}
        {ready && !empty ? (
          <FamilyTreeCanvas
            selectedPersonId={selectedPersonId}
            onSelectPerson={setSelectedPersonId}
          />
        ) : null}
      </main>
      <aside className="app-panel" aria-label="編集パネル" hidden>
        {/* 人物編集パネル(tree-editor実装時に差し替え) */}
      </aside>
    </div>
  )
}

export default App

import { useState } from 'react'
import './App.css'
import './components/confirm-dialog.css'
import { EmptyStateGuide } from './components/EmptyStateGuide'
import { PersonPanel } from './components/PersonPanel'
import { SettingsMenu } from './components/SettingsMenu'
import {
  usePersistedTree,
  type PersistenceStatus,
} from './persistence/use-persisted-tree'
import { FamilyTreeCanvas } from './rendering/FamilyTreeCanvas'
import { useSampleLoader } from './samples/use-sample-loader'
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
  const personCount = useTreeStore(
    (s) => Object.keys(s.document.persons).length,
  )
  const blocked = status.phase === 'blocked'
  const ready = status.phase === 'ready'
  const empty = ready && personCount === 0
  const { pendingSample, confirmOverwrite, cancelOverwrite } =
    useSampleLoader(ready)

  return (
    <div className="app-frame">
      <header className="app-header">
        <h1 className="app-title">家系図</h1>
        <div className="app-header-right">
          <p className="app-header-status" aria-live="polite">
            {saveStatusText(status)}
          </p>
          <SettingsMenu onReset={resetAllData} />
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
      {pendingSample ? (
        <div className="confirm-dialog-overlay">
          <div
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sample-overwrite-title"
          >
            <h2 id="sample-overwrite-title">サンプルで置き換えますか?</h2>
            <p>
              サンプル「{pendingSample.title}」を開くと、現在の家系図(人物
              {personCount}
              名)は置き換えられ、元に戻す(undo)こともできなくなります。残しておきたい場合はキャンセルし、設定メニューからエクスポートしてください。
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
                置き換えて開く
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <aside
        className="app-panel"
        aria-label="編集パネル"
        hidden={!selectedPersonId}
      >
        {selectedPersonId ? (
          <PersonPanel
            personId={selectedPersonId}
            onDeleted={() => setSelectedPersonId(null)}
            onClose={() => setSelectedPersonId(null)}
          />
        ) : null}
      </aside>
    </div>
  )
}

export default App

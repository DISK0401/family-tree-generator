import { useRef, useState } from 'react'
import './App.css'
import { ConfirmDialog } from './components/ConfirmDialog'
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
    case 'unavailable':
      return status.reason === 'load-failed'
        ? '保存データを読み込めませんでした。再読み込みするか、すべてのデータを削除してやり直せます。'
        : '保存データが壊れているため読み込めません(データは削除していません)。すべてのデータを削除すると新規に始められます。'
    case 'stale':
      return '別のタブでこの家系図が編集されました。このタブの表示は古いため、再読み込みしてください。'
    case 'ready':
      switch (status.saveState) {
        case 'idle':
          return 'この端末にのみ保存されます'
        case 'saving':
          return '保存中…'
        case 'saved':
          return '保存済み(この端末にのみ保存されます)'
        case 'error':
          return '保存に失敗しました'
      }
  }
}

function App() {
  const { status, resetAllData, retrySave, persistenceAtRisk } =
    usePersistedTree()
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null)
  const personCount = useTreeStore(
    (s) => Object.keys(s.document.persons).length,
  )
  const ready = status.phase === 'ready'
  // blocked / unavailable / stale はいずれも「編集しても保存されない(または上書き事故になる)」
  // 状態。編集UI(キャンバス・パネル)を出さず、インポートも無効化する
  const editingHalted =
    status.phase === 'blocked' ||
    status.phase === 'unavailable' ||
    status.phase === 'stale'
  const saveError = status.phase === 'ready' && status.saveState === 'error'
  const empty = ready && personCount === 0
  const { pendingSample, confirmOverwrite, cancelOverwrite, sampleError } =
    useSampleLoader(ready)

  // 未確定の変更がある状態で選択を切り替えようとした場合の確認(design.md D3)。
  // pendingSelectionは「移動先」を保持し、undefinedは「確認待ちなし」を表す
  // (nullは「パネルを閉じる」という正当な移動先のため、undefinedと区別する)
  const [isDirty, setIsDirty] = useState(false)
  const [pendingSelection, setPendingSelection] = useState<
    string | null | undefined
  >(undefined)
  const editFormRef = useRef<HTMLFormElement | null>(null)

  function requestSelectionChange(next: string | null) {
    if (isDirty) {
      setPendingSelection(next)
      return
    }
    setSelectedPersonId(next)
  }

  function cancelPendingSelection() {
    setPendingSelection(undefined)
  }

  function discardAndMove() {
    if (pendingSelection === undefined) return
    setIsDirty(false)
    setSelectedPersonId(pendingSelection)
    setPendingSelection(undefined)
  }

  function saveAndMove() {
    if (pendingSelection === undefined) return
    editFormRef.current?.requestSubmit()
    setIsDirty(false)
    setSelectedPersonId(pendingSelection)
    setPendingSelection(undefined)
  }

  return (
    <div className="app-frame">
      <header className="app-header">
        <h1 className="app-title">家系図帖</h1>
        <div className="app-header-right">
          {saveError ? (
            <div className="app-save-error" role="alert">
              <span>
                保存できない間の変更は、設定メニューのエクスポートで退避できます。
              </span>
              <button type="button" onClick={retrySave}>
                再試行
              </button>
            </div>
          ) : null}
          <p className="app-header-status" aria-live="polite">
            {saveStatusText(status)}
          </p>
          <SettingsMenu onReset={resetAllData} importDisabled={editingHalted} />
        </div>
      </header>
      {persistenceAtRisk ? (
        <p className="app-persistence-note">
          ブラウザの判断で保存データが削除される場合があります。定期的なエクスポートをおすすめします
        </p>
      ) : null}
      <main className="app-canvas" aria-label="家系図キャンバス">
        {editingHalted ? (
          <div className="app-blocked-message" role="alert">
            <p>{saveStatusText(status)}</p>
            {status.phase === 'stale' ? (
              <button
                type="button"
                className="app-blocked-reload"
                onClick={() => window.location.reload()}
              >
                再読み込み
              </button>
            ) : null}
          </div>
        ) : null}
        {sampleError ? (
          <p className="app-sample-error" role="alert">
            {sampleError}
          </p>
        ) : null}
        {empty ? <EmptyStateGuide onAdded={setSelectedPersonId} /> : null}
        {ready && !empty ? (
          <FamilyTreeCanvas
            selectedPersonId={selectedPersonId}
            onSelectPerson={requestSelectionChange}
          />
        ) : null}
      </main>
      {pendingSample ? (
        <ConfirmDialog
          title="サンプルで置き換えますか?"
          confirmLabel="置き換えて開く"
          confirmDanger
          onConfirm={confirmOverwrite}
          onCancel={cancelOverwrite}
        >
          <p>
            サンプル「{pendingSample.title}」を開くと、現在の家系図(人物
            {personCount}
            名)は置き換えられ、元に戻す(undo)こともできなくなります。残しておきたい場合はキャンセルし、設定メニューからエクスポートしてください。
          </p>
        </ConfirmDialog>
      ) : null}
      {pendingSelection !== undefined ? (
        <ConfirmDialog
          title="保存されていない変更があります"
          alertdialog
          cancelLabel="編集を続ける"
          onCancel={cancelPendingSelection}
          extraAction={{
            label: '変更を破棄して移動する',
            danger: true,
            onSelect: discardAndMove,
          }}
          confirmLabel="保存して移動する"
          confirmAutoFocus
          onConfirm={saveAndMove}
        >
          <p>
            人物情報の変更が確定されていません。このまま移動すると変更は失われます。
          </p>
        </ConfirmDialog>
      ) : null}
      <aside
        className="app-panel"
        aria-label="編集パネル"
        hidden={!selectedPersonId || !ready}
      >
        {selectedPersonId && ready ? (
          <PersonPanel
            personId={selectedPersonId}
            onDeleted={() => {
              setIsDirty(false)
              setSelectedPersonId(null)
            }}
            onClose={() => requestSelectionChange(null)}
            onDirtyChange={setIsDirty}
            editFormRef={editFormRef}
          />
        ) : null}
      </aside>
    </div>
  )
}

export default App

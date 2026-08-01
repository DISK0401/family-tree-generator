import { useRef, useState } from 'react'
import './App.css'
import { ConfirmDialog } from './components/ConfirmDialog'
import { EmptyStateGuide } from './components/EmptyStateGuide'
import { PersonPanel } from './components/PersonPanel'
import { PersonTableView } from './components/PersonTableView'
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

  // 図 / 表のビュー切替(spec person-table-editor「表形式ビューと図の切り替え」、
  // design.md D1)。キャンバス左下の表示モード3種は「図の描き方」の切替であり、
  // 表は図ではないため別の切替として持つ。URLには載せない(リロードで図に戻る)
  const [view, setView] = useState<'chart' | 'table'>('chart')
  // 表へ移る操作もパネルの未確定変更の離脱確認を通す。確認の移動先は「選択」だが、
  // 表へ切り替えたい意図を保持しておき、確認の解決後に反映する
  const [pendingView, setPendingView] = useState<'chart' | 'table' | null>(null)

  function requestSelectionChange(next: string | null) {
    if (isDirty) {
      setPendingSelection(next)
      return
    }
    setSelectedPersonId(next)
  }

  function requestViewChange(next: 'chart' | 'table') {
    if (next === view) return
    if (isDirty) {
      // 未確定の変更があるうちは切り替えない(離脱確認の結果を待つ)
      setPendingView(next)
      setPendingSelection(selectedPersonId)
      return
    }
    setView(next)
  }

  function cancelPendingSelection() {
    setPendingSelection(undefined)
    setPendingView(null)
  }

  function applyPendingView() {
    if (pendingView) setView(pendingView)
    setPendingView(null)
  }

  function discardAndMove() {
    if (pendingSelection === undefined) return
    setIsDirty(false)
    setSelectedPersonId(pendingSelection)
    setPendingSelection(undefined)
    applyPendingView()
  }

  function saveAndMove() {
    if (pendingSelection === undefined) return
    editFormRef.current?.requestSubmit()
    setIsDirty(false)
    setSelectedPersonId(pendingSelection)
    setPendingSelection(undefined)
    applyPendingView()
  }

  return (
    <div className="app-frame">
      <header className="app-header">
        <h1 className="app-title">家系図帖</h1>
        {ready && !empty ? (
          <div
            className="segmented segmented--framed app-view-toggle"
            role="group"
            aria-label="表示の切り替え"
          >
            <button
              type="button"
              className="segmented-item"
              aria-pressed={view === 'chart'}
              onClick={() => requestViewChange('chart')}
            >
              図
            </button>
            <button
              type="button"
              className="segmented-item"
              aria-pressed={view === 'table'}
              onClick={() => requestViewChange('table')}
            >
              表
            </button>
          </div>
        ) : null}
        <div className="app-header-right">
          {saveError ? (
            <div className="app-save-error" role="alert">
              <span>
                保存できない間の変更は、設定メニューのエクスポートで退避できます。
              </span>
              <button type="button" className="btn" onClick={retrySave}>
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
      <main
        className="app-canvas"
        aria-label={view === 'table' ? '人物一覧' : '家系図キャンバス'}
      >
        {editingHalted ? (
          <div
            className="app-blocked-message surface--notice surface--notice-danger"
            role="alert"
          >
            <p>{saveStatusText(status)}</p>
            {status.phase === 'stale' ? (
              <button
                type="button"
                className="btn btn--outline app-blocked-reload"
                onClick={() => window.location.reload()}
              >
                再読み込み
              </button>
            ) : null}
          </div>
        ) : null}
        {sampleError ? (
          <p className="app-sample-error surface--notice" role="alert">
            {sampleError}
          </p>
        ) : null}
        {empty ? <EmptyStateGuide onAdded={setSelectedPersonId} /> : null}
        {ready && !empty && view === 'chart' ? (
          <FamilyTreeCanvas
            selectedPersonId={selectedPersonId}
            onSelectPerson={requestSelectionChange}
          />
        ) : null}
        {ready && !empty && view === 'table' ? (
          <PersonTableView
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
      {/* 表モードでは属性編集を表自身が担うため、右パネルは出さない(design.md D1)。
          関係の編集をしたくなったら図へ戻る(選択は共有されている) */}
      <aside
        className="app-panel"
        aria-label="編集パネル"
        hidden={!selectedPersonId || !ready || view === 'table'}
      >
        {selectedPersonId && ready && view === 'chart' ? (
          <PersonPanel
            personId={selectedPersonId}
            onDeleted={() => {
              setIsDirty(false)
              setSelectedPersonId(null)
            }}
            onClose={() => requestSelectionChange(null)}
            onDirtyChange={setIsDirty}
            editFormRef={editFormRef}
            onPersonCreated={requestSelectionChange}
          />
        ) : null}
      </aside>
    </div>
  )
}

export default App

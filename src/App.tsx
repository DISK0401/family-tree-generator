import './App.css'

function App() {
  return (
    <div className="app-frame">
      <header className="app-header">
        <h1 className="app-title">家系図</h1>
        <div className="app-header-status" aria-live="polite">
          {/* 保存状態表示(local-autosave実装時に差し替え) */}
        </div>
      </header>
      <main className="app-canvas" aria-label="家系図キャンバス">
        {/* 家系図キャンバス(tree-rendering実装時に差し替え) */}
      </main>
      <aside className="app-panel" aria-label="編集パネル" hidden>
        {/* 人物編集パネル(tree-editor実装時に差し替え) */}
      </aside>
    </div>
  )
}

export default App

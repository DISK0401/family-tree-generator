import type { ReactNode } from 'react'
import './AppShell.css'

export interface AppShellProps {
  /** ヘッダ左の見出し */
  title: string
  /** 見出しの右に置く表示切替(出さない場合は null) */
  viewToggle?: ReactNode
  /** ヘッダ右端の状態表示・設定メニュー等 */
  headerRight: ReactNode
  /** ヘッダ直下の注意書き(出さない場合は null。無ければ行の高さは潰れる) */
  notice?: ReactNode
  /** 図・表の領域につける説明(支援技術向け) */
  canvasLabel: string
  canvas: ReactNode
  /** 右の編集パネルの中身 */
  panel?: ReactNode
  /** パネルを隠すか(hidden属性。DOMは残す) */
  panelHidden: boolean
  /** モーダル(確認ダイアログ等)。トップレイヤ表示のため配置場所は問わない */
  dialogs?: ReactNode
}

/**
 * エディタ画面の骨組み。ヘッダ・注意書き・図(表)・編集パネルの4領域を
 * グリッドで配置し、それぞれの中身はスロットとして受け取る。
 *
 * **状態を持たない**(Atomic Design の templates 層)。どの領域に何を出すかの
 * 判断と状態管理は `pages/AppPage.tsx` が担う。この分離により、有償版で
 * ヘッダに課金状態を足すような変更が骨組みを触らずに済む。
 *
 * NOTE: 家系図の座標計算を担う `src/layout/` とは役割が異なる。
 * こちらは画面の骨組み、あちらは図のノード位置の計算(純関数)。
 */
export function AppShell({
  title,
  viewToggle,
  headerRight,
  notice,
  canvasLabel,
  canvas,
  panel,
  panelHidden,
  dialogs,
}: AppShellProps) {
  return (
    <div className="app-frame">
      <header className="app-header">
        <h1 className="app-title">{title}</h1>
        {viewToggle}
        <div className="app-header-right">{headerRight}</div>
      </header>
      {notice}
      <main className="app-canvas" aria-label={canvasLabel}>
        {canvas}
      </main>
      {dialogs}
      {/* 表モードでは属性編集を表自身が担うため、右パネルは出さない(design.md D1)。
          関係の編集をしたくなったら図へ戻る(選択は共有されている) */}
      <aside className="app-panel" aria-label="編集パネル" hidden={panelHidden}>
        {panel}
      </aside>
    </div>
  )
}

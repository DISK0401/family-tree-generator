import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { DisplaySettingsControl } from '../settings/DisplaySettingsControl'
import { DataResetControl } from './DataResetControl'
import './SettingsMenu.css'
import { Button } from '../../atoms/Button'
import { Surface } from '../../atoms/Surface'

interface SettingsMenuProps {
  onReset: () => Promise<void>
  /**
   * インポート/エクスポートの操作。別の機能(organisms/import-export)に属するため、
   * ここで直接 import せずページから差し込む(機能間の直接依存を作らない。design.md D2)
   */
  importExport?: ReactNode
}

/**
 * 破壊的操作(全データ削除)を格納する設定メニュー。
 * 最も破壊的な操作を常時ヘッダーに露出させないための格納庫(Fableレビュー反映)。
 *
 * a11y(監査 中6): パネルの中身はフォーム・ボタンの混在でメニュー項目のロール要件を
 * 満たせないため、role="menu"/aria-haspopupは使わず「aria-expandedのみの
 * ディスクロージャ」として実装する。Escで閉じてトリガーへフォーカスを戻す。
 */
export function SettingsMenu({ onReset, importExport }: SettingsMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    // mousedownではなくpointerdownで判定する(タッチ・ペン由来の操作でも閉じられるように)
    function handlePointerDownOutside(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDownOutside)
    return () =>
      document.removeEventListener('pointerdown', handlePointerDownOutside)
  }, [open])

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Escape' || !open) return
    // ConfirmDialog(showModal)が開いている間のEscはダイアログ側が受けるため、
    // ここに届くのはパネルが最前面のときだけ
    e.stopPropagation()
    setOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <div className="settings-menu" ref={rootRef} onKeyDown={handleKeyDown}>
      <Button
        variant="ghost"
        className="settings-menu-trigger"
        ref={triggerRef}
        aria-expanded={open}
        aria-label="設定"
        onClick={() => setOpen((v) => !v)}
      >
        ⋯
      </Button>
      {open && (
        <Surface variant="floating" className="settings-menu-panel">
          <DisplaySettingsControl />
          {importExport}
          <DataResetControl onReset={onReset} />
        </Surface>
      )}
    </div>
  )
}

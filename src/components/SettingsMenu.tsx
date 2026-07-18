import { useEffect, useRef, useState } from 'react'
import { DisplaySettingsControl } from '../settings/DisplaySettingsControl'
import { DataResetControl } from './DataResetControl'
import { ImportExportControl } from './ImportExportControl'
import './SettingsMenu.css'

interface SettingsMenuProps {
  onReset: () => Promise<void>
}

/**
 * 破壊的操作(全データ削除)を格納する設定メニュー。
 * 最も破壊的な操作を常時ヘッダーに露出させないための格納庫(Fableレビュー反映)。
 */
export function SettingsMenu({ onReset }: SettingsMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div className="settings-menu" ref={rootRef}>
      <button
        type="button"
        className="settings-menu-trigger"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="設定"
        onClick={() => setOpen((v) => !v)}
      >
        ⋯
      </button>
      {open && (
        <div className="settings-menu-panel" role="menu">
          <DisplaySettingsControl />
          <ImportExportControl />
          <DataResetControl onReset={onReset} />
        </div>
      )}
    </div>
  )
}

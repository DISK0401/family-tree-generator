import type { ReactNode } from 'react'

/* 機能カード用の小さな線画アイコン。currentColorで描き、カード側の文字色に追従させる */

export type FeatureIconKind =
  | 'privacy'
  | 'wareki'
  | 'family'
  | 'autosave'
  | 'io'
  | 'scan'
  | 'cloud'
  | 'print'

const PATHS: Record<FeatureIconKind, ReactNode> = {
  privacy: (
    <>
      <path d="M16 4l10 4v7c0 6.5-4.2 11.5-10 14-5.8-2.5-10-7.5-10-14V8z" />
      <path d="M11.5 15.5l3.5 3.5 6-6" />
    </>
  ),
  wareki: (
    <>
      <rect x="4" y="6" width="24" height="21" rx="2" />
      <path d="M4 12h24M10 3v6M22 3v6" />
      <text
        x="16"
        y="23"
        textAnchor="middle"
        fontSize="10"
        stroke="none"
        fill="currentColor"
      >
        和
      </text>
    </>
  ),
  family: (
    <>
      <rect x="11" y="4" width="10" height="7" rx="1" />
      <rect x="3" y="21" width="10" height="7" rx="1" />
      <rect x="19" y="21" width="10" height="7" rx="1" />
      <path d="M16 11v5M8 21v-2.5h16V21M8 18.5v-2.5h8" />
    </>
  ),
  autosave: (
    <>
      <path d="M16 4v14M16 18l-5-5M16 18l5-5" />
      <path d="M5 20v5a3 3 0 0 0 3 3h16a3 3 0 0 0 3-3v-5" />
    </>
  ),
  io: (
    <>
      <path d="M4 11h17M21 11l-4.5-4.5M21 11l-4.5 4.5" />
      <path d="M28 21H11M11 21l4.5-4.5M11 21l4.5 4.5" />
    </>
  ),
  scan: (
    <>
      <path d="M4 9V6a2 2 0 0 1 2-2h3M23 4h3a2 2 0 0 1 2 2v3M28 23v3a2 2 0 0 1-2 2h-3M9 28H6a2 2 0 0 1-2-2v-3" />
      <path d="M9 12h14M9 16h14M9 20h9" />
    </>
  ),
  cloud: (
    <>
      <path d="M9 23a5.5 5.5 0 0 1-.6-10.9A8 8 0 0 1 24 10.5 5.8 5.8 0 0 1 23.5 22" />
      <path d="M16 28v-9M13 22l3-3 3 3" />
    </>
  ),
  print: (
    <>
      <path d="M9 12V5h14v7" />
      <rect x="5" y="12" width="22" height="10" rx="2" />
      <path d="M9 18h14v9H9z" />
    </>
  ),
}

export function FeatureIcon({ kind }: { kind: FeatureIconKind }) {
  return (
    <svg
      className="feature-icon"
      viewBox="0 0 32 32"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[kind]}
    </svg>
  )
}

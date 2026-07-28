import type { Pedigree } from '../../domain/types'
import type { GedcomVersion } from './version'

/** PEDIタグとして出力する値。phrase は7.0でのPHRASE補足(規格の列挙外の意味の説明)。 */
export interface PediExportValue {
  value: string
  phrase?: string
}

const EXPORT_PEDI_551: Record<Exclude<Pedigree, 'unknown'>, string> = {
  biological: 'birth',
  adopted: 'adopted',
  foster: 'foster',
  step: 'other',
}

const EXPORT_PEDI_70: Record<Exclude<Pedigree, 'unknown'>, string> = {
  biological: 'BIRTH',
  adopted: 'ADOPTED',
  foster: 'FOSTER',
  step: 'OTHER',
}

/**
 * 続柄種別をPEDIタグの出力表現へ変換する。undefined はPEDIタグ自体の省略を表す。
 * unknown は規格に無い値(旧実装の unknown/UNKNOWN)を出力しない:
 * - 5.5.1: PEDIタグ自体を省略する。インポート側の「PEDI欠落→実子」の慣行により
 *   往復で unknown→biological へ劣化するが、規格外値を出力するよりは許容する。
 * - 7.0: 規格内の `OTHER` に `PHRASE 続柄不明` を付けて出力する。インポート側の
 *   OTHER→unknown と対になり、7.0経由の往復では unknown が無損失で保たれる。
 */
export function pedigreeToPedi(
  pedigree: Pedigree,
  version: GedcomVersion,
): PediExportValue | undefined {
  if (pedigree === 'unknown') {
    return version === '7.0'
      ? { value: 'OTHER', phrase: '続柄不明' }
      : undefined
  }
  return version === '7.0'
    ? { value: EXPORT_PEDI_70[pedigree] }
    : { value: EXPORT_PEDI_551[pedigree] }
}

const IMPORT_PEDI: Record<string, Pedigree> = {
  BIRTH: 'biological',
  ADOPTED: 'adopted',
  FOSTER: 'foster',
  // OTHER は「標準の列挙にない続柄」の意で、旧実装のように継子(step)と断定できる
  // 根拠がないため unknown として取り込む(自アプリ7.0エクスポートの unknown→OTHER
  // とも整合)。副作用として step は OTHER 経由の往復で unknown へ劣化する。
  OTHER: 'unknown',
  // 旧バージョンの本アプリが出力していた規格外値との後方互換
  UNKNOWN: 'unknown',
}

/**
 * PEDIタグの値を続柄種別へ変換する。値が全く無い場合(他ツールが実子を
 * 省略記述する慣行)は実子として扱う。未知の値(SEALING等)は`unknown`とする。
 */
export function pediToPedigree(value: string | undefined): Pedigree {
  if (!value) {
    return 'biological'
  }
  return IMPORT_PEDI[value.trim().toUpperCase()] ?? 'unknown'
}

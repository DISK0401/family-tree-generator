import type { Pedigree } from '../../domain/types'
import type { GedcomVersion } from './version'

/** PEDIタグとして出力する値。phrase は7.0でのPHRASE補足(規格の列挙外の意味の説明)。 */
export interface PediExportValue {
  value: string
  phrase?: string
}

/**
 * 7.0で `PEDI OTHER` に付けるPHRASE値。エクスポートとインポートの両方で使い、
 * OTHERへ丸めた step / unknown をPHRASEで判別して往復無損失にする。
 */
const PEDI_PHRASE_STEP = '継子'
const PEDI_PHRASE_UNKNOWN = '続柄不明'

const EXPORT_PEDI_551: Record<Exclude<Pedigree, 'unknown' | 'step'>, string> = {
  biological: 'birth',
  adopted: 'adopted',
  foster: 'foster',
}

const EXPORT_PEDI_70: Record<Exclude<Pedigree, 'unknown' | 'step'>, string> = {
  biological: 'BIRTH',
  adopted: 'ADOPTED',
  foster: 'FOSTER',
}

/**
 * 続柄種別をPEDIタグの出力表現へ変換する。undefined はPEDIタグ自体の省略を表す。
 * 規格の列挙にない step / unknown の扱い:
 * - 7.0: どちらも規格内の `OTHER` に、判別用のPHRASE(`継子` / `続柄不明`)を付けて
 *   出力する。インポート側がPHRASEで判別するため、7.0経由の往復では無損失。
 * - 5.5.1: unknown はPEDIタグ自体を省略する(インポート側の「PEDI欠落→実子」の
 *   慣行により往復で unknown→biological へ劣化するが、規格外値の出力よりは許容する)。
 *   step は従来どおり `other` を出力する(5.5.1の標準列挙に該当値がなく、既存
 *   エクスポートとの後方互換を優先。省略すると実子へ化けるため独自値の方が安全)。
 *   5.5.1にはPHRASEが無いため、インポートで step→unknown+警告 へ劣化する
 *   (この劣化はテストでも明示している)。
 */
export function pedigreeToPedi(
  pedigree: Pedigree,
  version: GedcomVersion,
): PediExportValue | undefined {
  if (pedigree === 'unknown') {
    return version === '7.0'
      ? { value: 'OTHER', phrase: PEDI_PHRASE_UNKNOWN }
      : undefined
  }
  if (pedigree === 'step') {
    return version === '7.0'
      ? { value: 'OTHER', phrase: PEDI_PHRASE_STEP }
      : { value: 'other' }
  }
  return version === '7.0'
    ? { value: EXPORT_PEDI_70[pedigree] }
    : { value: EXPORT_PEDI_551[pedigree] }
}

const IMPORT_PEDI: Record<string, Pedigree> = {
  BIRTH: 'biological',
  ADOPTED: 'adopted',
  FOSTER: 'foster',
  // 旧バージョンの本アプリが出力していた規格外値との後方互換
  UNKNOWN: 'unknown',
}

/** PEDIタグの解釈結果。 */
export interface PediImportResult {
  pedigree: Pedigree
  /**
   * OTHER をPHRASEで判別できず unknown へ丸めた場合 true。
   * 呼び出し元が「続柄 OTHER は『不明』として取り込みました」系の警告を出す。
   */
  unrecognizedOther: boolean
}

/**
 * PEDIタグの値(+PHRASE補足)を続柄種別へ変換する。
 * - 値が全く無い場合(他ツールが実子を省略記述する慣行)は実子として扱う
 * - OTHER は本アプリの7.0エクスポートが付けるPHRASE(`継子`/`続柄不明`)で
 *   step / unknown を判別する。PHRASEが無い・判別できない場合は unknown へ丸め、
 *   呼び出し元が警告を出せるようフラグを立てる
 * - その他の未知の値(SEALING等)は unknown とする
 */
export function pediToPedigree(
  value: string | undefined,
  phrase?: string,
): PediImportResult {
  if (!value) {
    return { pedigree: 'biological', unrecognizedOther: false }
  }
  const normalized = value.trim().toUpperCase()
  if (normalized === 'OTHER') {
    const normalizedPhrase = phrase?.trim()
    if (normalizedPhrase === PEDI_PHRASE_STEP) {
      return { pedigree: 'step', unrecognizedOther: false }
    }
    if (normalizedPhrase === PEDI_PHRASE_UNKNOWN) {
      return { pedigree: 'unknown', unrecognizedOther: false }
    }
    return { pedigree: 'unknown', unrecognizedOther: true }
  }
  return {
    pedigree: IMPORT_PEDI[normalized] ?? 'unknown',
    unrecognizedOther: false,
  }
}

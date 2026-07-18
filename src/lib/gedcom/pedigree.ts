import type { Pedigree } from '../../domain/types'
import type { GedcomVersion } from './version'

const EXPORT_PEDI_551: Record<Pedigree, string> = {
  biological: 'birth',
  adopted: 'adopted',
  foster: 'foster',
  step: 'other',
  unknown: 'unknown',
}

const EXPORT_PEDI_70: Record<Pedigree, string> = {
  biological: 'BIRTH',
  adopted: 'ADOPTED',
  foster: 'FOSTER',
  step: 'OTHER',
  unknown: 'UNKNOWN',
}

export function pedigreeToPedi(
  pedigree: Pedigree,
  version: GedcomVersion,
): string {
  return version === '7.0'
    ? EXPORT_PEDI_70[pedigree]
    : EXPORT_PEDI_551[pedigree]
}

const IMPORT_PEDI: Record<string, Pedigree> = {
  BIRTH: 'biological',
  ADOPTED: 'adopted',
  FOSTER: 'foster',
  OTHER: 'step',
  UNKNOWN: 'unknown',
  SEALING: 'biological',
}

/**
 * PEDIタグの値を続柄種別へ変換する。値が全く無い場合(他ツールが実子を
 * 省略記述する慣行)は実子として扱う。未知の値は`unknown`とする。
 */
export function pediToPedigree(value: string | undefined): Pedigree {
  if (!value) {
    return 'biological'
  }
  return IMPORT_PEDI[value.trim().toUpperCase()] ?? 'unknown'
}

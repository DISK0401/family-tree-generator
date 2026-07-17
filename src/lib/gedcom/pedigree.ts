import type { ChildPedigree } from '../../domain/family'
import type { GedcomVersion } from './version'

const EXPORT_PEDI_551: Record<ChildPedigree, string> = {
  biological: 'birth',
  adopted: 'adopted',
  foster: 'foster',
  step: 'other',
}

const EXPORT_PEDI_70: Record<ChildPedigree, string> = {
  biological: 'BIRTH',
  adopted: 'ADOPTED',
  foster: 'FOSTER',
  step: 'OTHER',
}

export function childPedigreeToPedi(
  pedigree: ChildPedigree,
  version: GedcomVersion,
): string {
  return version === '7.0'
    ? EXPORT_PEDI_70[pedigree]
    : EXPORT_PEDI_551[pedigree]
}

const IMPORT_PEDI: Record<string, ChildPedigree> = {
  BIRTH: 'biological',
  ADOPTED: 'adopted',
  FOSTER: 'foster',
  OTHER: 'step',
  SEALING: 'biological',
}

export interface PedigreeImportResult {
  pedigree: ChildPedigree
  unrecognized: boolean
}

/** PEDIタグの値を続柄種別へ変換する。値がない場合は実子として扱う(GEDCOM慣行)。 */
export function pediToChildPedigree(
  value: string | undefined,
): PedigreeImportResult {
  if (!value) {
    return { pedigree: 'biological', unrecognized: false }
  }
  const mapped = IMPORT_PEDI[value.trim().toUpperCase()]
  if (mapped) {
    return { pedigree: mapped, unrecognized: false }
  }
  return { pedigree: 'biological', unrecognized: true }
}

import type {
  Family,
  Gender,
  LifeEvent,
  Person,
  TreeDocument,
} from '../../domain/types'
import type { GedcomNode } from '../../domain/gedcomNode'
import type { GedcomVersion } from './version'
import { xrefToPointer } from './nodeHelpers'
import { personNameToGedcomNode } from './nameMapping'
import { fuzzyDateToGedcomNode } from './dateMapping'
import { pedigreeToPedi } from './pedigree'
import { serializeGedcomTree } from './serializer'

export interface GedcomExportResult {
  text: string
  warnings: string[]
}

const GENDER_EXPORT: Record<Gender, string> = {
  male: 'M',
  female: 'F',
  unknown: 'U',
}

function buildHeader(
  version: GedcomVersion,
  document: TreeDocument,
): GedcomNode {
  const versionValue = version === '7.0' ? '7.0' : '5.5.1'
  const children: GedcomNode[] = [
    {
      tag: 'GEDC',
      children: [{ tag: 'VERS', value: versionValue, children: [] }],
    },
  ]
  if (version === '5.5.1') {
    children.push({ tag: 'CHAR', value: 'UTF-8', children: [] })
  }
  children.push({ tag: '_TREE_TITLE', value: document.title, children: [] })
  return { tag: 'HEAD', children }
}

function lifeEventToNode<T extends string>(
  tag: string,
  event: LifeEvent<T>,
  version: GedcomVersion,
): GedcomNode {
  const children: GedcomNode[] = []
  if (event.date) {
    const { dateNode, siblingNodes } = fuzzyDateToGedcomNode(
      event.date,
      version,
    )
    children.push(dateNode, ...siblingNodes)
  }
  if (event.place) {
    children.push({ tag: 'PLAC', value: event.place, children: [] })
  }
  return { tag, children }
}

function personToIndiNode(
  person: Person,
  personIdToXref: Map<string, string>,
  familyIdToXref: Map<string, string>,
  families: Family[],
  version: GedcomVersion,
): GedcomNode {
  const children: GedcomNode[] = [personNameToGedcomNode(person.name)]

  children.push({
    tag: 'SEX',
    value: GENDER_EXPORT[person.gender],
    children: [],
  })

  if (person.birth) {
    children.push(lifeEventToNode('BIRT', person.birth, version))
  }
  if (person.death) {
    children.push(lifeEventToNode('DEAT', person.death, version))
  }

  for (const family of families) {
    const familyXref = familyIdToXref.get(family.id)
    if (!familyXref) {
      continue
    }
    if (family.spouseIds.includes(person.id)) {
      children.push({
        tag: 'FAMS',
        value: xrefToPointer(familyXref),
        children: [],
      })
    }
    const childLink = family.children.find(
      (child) => child.childId === person.id,
    )
    if (childLink) {
      children.push({
        tag: 'FAMC',
        value: xrefToPointer(familyXref),
        children: [
          {
            tag: 'PEDI',
            value: pedigreeToPedi(childLink.pedigree, version),
            children: [],
          },
        ],
      })
    }
  }

  if (person.note) {
    children.push({ tag: 'NOTE', value: person.note, children: [] })
  }

  return { tag: 'INDI', xref: personIdToXref.get(person.id), children }
}

function familyToFamNode(
  family: Family,
  personIdToXref: Map<string, string>,
  familyIdToXref: Map<string, string>,
  persons: Record<string, Person>,
  version: GedcomVersion,
  warnings: string[],
): GedcomNode {
  const children: GedcomNode[] = []

  const [firstId, secondId, ...restIds] = family.spouseIds

  if (firstId) {
    const xref = personIdToXref.get(firstId)
    if (xref) {
      children.push({ tag: 'HUSB', value: xrefToPointer(xref), children: [] })
    }
  }
  if (secondId) {
    const xref = personIdToXref.get(secondId)
    if (xref) {
      children.push({ tag: 'WIFE', value: xrefToPointer(xref), children: [] })
    }
  }
  for (const extraId of restIds) {
    const xref = personIdToXref.get(extraId)
    if (xref) {
      children.push({ tag: 'WIFE', value: xrefToPointer(xref), children: [] })
    }
  }
  if (restIds.length > 0) {
    warnings.push(
      '3名以上のパートナーを持つ家族はGEDCOMの標準構造(HUSB/WIFE 2枠)を超えるため、3人目以降は非標準的に出力されます(再インポート時に失われる可能性があります)',
    )
  }

  const firstGender = firstId ? persons[firstId]?.gender : undefined
  const secondGender = secondId ? persons[secondId]?.gender : undefined
  const roleIsGenderConsistent =
    (!firstId || firstGender === 'male') &&
    (!secondId || secondGender === 'female')
  if (!roleIsGenderConsistent && (firstId || secondId)) {
    children.push({ tag: '_SPOUSE_ROLE_UNKNOWN', value: 'Y', children: [] })
  }

  children.push({ tag: '_FAM_KIND', value: family.kind, children: [] })

  for (const event of family.events) {
    const tag: string = event.type === 'marriage' ? 'MARR' : 'DIV'
    children.push(lifeEventToNode(tag, event, version))
  }

  for (const child of family.children) {
    const childXref = personIdToXref.get(child.childId)
    if (!childXref) {
      continue
    }
    children.push({
      tag: 'CHIL',
      value: xrefToPointer(childXref),
      children: [],
    })
  }

  return { tag: 'FAM', xref: familyIdToXref.get(family.id), children }
}

/**
 * TreeDocument をGEDCOMテキストへエクスポートする。7.0/5.5.1互換モードの
 * どちらも本関数から生成する。docs/gedcom-mapping.md の対応表に従う。
 */
export function exportGedcom(
  document: TreeDocument,
  version: GedcomVersion,
): GedcomExportResult {
  const warnings: string[] = []

  const people = Object.values(document.persons)
  const families = Object.values(document.families)

  const personIdToXref = new Map<string, string>()
  people.forEach((person, index) => {
    personIdToXref.set(person.id, `I${index + 1}`)
  })
  const familyIdToXref = new Map<string, string>()
  families.forEach((family, index) => {
    familyIdToXref.set(family.id, `F${index + 1}`)
  })

  const indiNodes = people.map((person) =>
    personToIndiNode(person, personIdToXref, familyIdToXref, families, version),
  )
  const famNodes = families.map((family) =>
    familyToFamNode(
      family,
      personIdToXref,
      familyIdToXref,
      document.persons,
      version,
      warnings,
    ),
  )

  const roots: GedcomNode[] = [
    buildHeader(version, document),
    ...indiNodes,
    ...famNodes,
    { tag: 'TRLR', children: [] },
  ]

  return { text: serializeGedcomTree(roots), warnings }
}

/** UTF-8(BOM付き)のバイト列へエンコードする(エクスポートは常にBOM付きUTF-8とする)。 */
export function encodeGedcomTextToBytes(text: string): Uint8Array {
  const bom = new Uint8Array([0xef, 0xbb, 0xbf])
  const body = new TextEncoder().encode(text)
  const combined = new Uint8Array(bom.length + body.length)
  combined.set(bom, 0)
  combined.set(body, bom.length)
  return combined
}

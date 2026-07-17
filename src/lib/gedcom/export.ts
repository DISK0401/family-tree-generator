import type { FamilyTreeData } from '../../domain/model'
import type { Person, Gender, LifeEvent } from '../../domain/person'
import type { Family } from '../../domain/family'
import type { GedcomNode } from '../../domain/gedcomNode'
import type { GedcomVersion } from './version'
import { xrefToPointer } from './nodeHelpers'
import { personNameToGedcomNodes } from './nameMapping'
import { lifeDateToGedcomNode } from './dateMapping'
import { childPedigreeToPedi } from './pedigree'
import { relationshipTypeToGedcomNodes } from './relationshipMapping'
import { serializeGedcomTree } from './serializer'

export interface GedcomExportResult {
  text: string
  warnings: string[]
}

const GENDER_EXPORT: Record<Gender, string> = {
  male: 'M',
  female: 'F',
  x: 'X',
  unknown: 'U',
}

function buildHeader(version: GedcomVersion): GedcomNode {
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
  return { tag: 'HEAD', children }
}

function lifeEventToNode(
  tag: string,
  event: LifeEvent,
  version: GedcomVersion,
): GedcomNode {
  const children: GedcomNode[] = []
  if (event.date) {
    const { dateNode, siblingNodes } = lifeDateToGedcomNode(event.date, version)
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
  const children: GedcomNode[] = [
    ...personNameToGedcomNodes(person.name, version),
  ]

  if (person.gender) {
    children.push({
      tag: 'SEX',
      value: GENDER_EXPORT[person.gender],
      children: [],
    })
  }

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
    if (family.partnerIds.includes(person.id)) {
      children.push({
        tag: 'FAMS',
        value: xrefToPointer(familyXref),
        children: [],
      })
    }
    const childLink = family.children.find(
      (child) => child.personId === person.id,
    )
    if (childLink) {
      children.push({
        tag: 'FAMC',
        value: xrefToPointer(familyXref),
        children: [
          {
            tag: 'PEDI',
            value: childPedigreeToPedi(childLink.pedigree, version),
            children: [],
          },
        ],
      })
    }
  }

  if (person.note) {
    children.push({ tag: 'NOTE', value: person.note, children: [] })
  }

  children.push(...(person.unmappedTags ?? []))

  return { tag: 'INDI', xref: personIdToXref.get(person.id), children }
}

function familyToFamNode(
  family: Family,
  personIdToXref: Map<string, string>,
  familyIdToXref: Map<string, string>,
  version: GedcomVersion,
  warnings: string[],
): GedcomNode {
  const children: GedcomNode[] = []

  const [firstPartnerId, secondPartnerId, ...restPartnerIds] = family.partnerIds

  for (const [index, partnerId] of [firstPartnerId, secondPartnerId]
    .filter((id): id is string => id !== undefined)
    .entries()) {
    const partnerXref = personIdToXref.get(partnerId)
    if (!partnerXref) {
      continue
    }
    children.push({
      tag: index === 0 ? 'HUSB' : 'WIF',
      value: xrefToPointer(partnerXref),
      children: [],
    })
  }
  // 3人以上のパートナーは想定外だが、情報を失わないよう非標準にWIFで追加出力する
  for (const partnerId of restPartnerIds) {
    const partnerXref = personIdToXref.get(partnerId)
    if (partnerXref) {
      children.push({
        tag: 'WIF',
        value: xrefToPointer(partnerXref),
        children: [],
      })
    }
  }

  const relationshipResult = relationshipTypeToGedcomNodes(
    family.relationshipType,
    version,
  )
  warnings.push(...relationshipResult.warnings)

  const marriageEventChildren: GedcomNode[] = []
  if (family.marriageDate) {
    const { dateNode, siblingNodes } = lifeDateToGedcomNode(
      family.marriageDate,
      version,
    )
    marriageEventChildren.push(dateNode, ...siblingNodes)
  }
  if (family.marriagePlace) {
    marriageEventChildren.push({
      tag: 'PLAC',
      value: family.marriagePlace,
      children: [],
    })
  }
  const marrNode = relationshipResult.nodes.find((node) => node.tag === 'MARR')
  if (marrNode && marriageEventChildren.length > 0) {
    marrNode.children.push(...marriageEventChildren)
  }
  children.push(...relationshipResult.nodes)

  if (family.divorceDate) {
    let divNode = relationshipResult.nodes.find((node) => node.tag === 'DIV')
    if (!divNode) {
      divNode = { tag: 'DIV', children: [] }
      children.push(divNode)
    }
    const { dateNode, siblingNodes } = lifeDateToGedcomNode(
      family.divorceDate,
      version,
    )
    divNode.children.push(dateNode, ...siblingNodes)
  }

  for (const child of family.children) {
    const childXref = personIdToXref.get(child.personId)
    if (!childXref) {
      continue
    }
    children.push({
      tag: 'CHIL',
      value: xrefToPointer(childXref),
      children: [],
    })
  }

  if (family.note) {
    children.push({ tag: 'NOTE', value: family.note, children: [] })
  }

  children.push(...(family.unmappedTags ?? []))

  return { tag: 'FAM', xref: familyIdToXref.get(family.id), children }
}

/**
 * 内部データモデルをGEDCOMテキストへエクスポートする。7.0/5.5.1互換モードの
 * どちらも本関数から生成する(design.md モジュール構成)。
 *
 * sourceVersion(データがインポートされた元のGEDCOMバージョン)が分かっており、
 * かつ出力バージョンと異なる場合、非対応タグ(unmappedTags)を保有する人物・家族
 * について「バージョンをまたぐ再エクスポートでは変換されない」旨を警告する
 * (design.md Risks、gedcom-import-export spec「バージョンをまたぐ再エクスポートの警告」)。
 */
export function exportGedcom(
  data: FamilyTreeData,
  version: GedcomVersion,
  sourceVersion?: GedcomVersion,
): GedcomExportResult {
  const warnings: string[] = []

  if (sourceVersion && sourceVersion !== version) {
    for (const person of data.people) {
      if (person.unmappedTags && person.unmappedTags.length > 0) {
        warnings.push(
          `人物の非標準タグはGEDCOM ${sourceVersion}由来のため、${version}へは変換されず保全のみされました`,
        )
      }
    }
    for (const family of data.families) {
      if (family.unmappedTags && family.unmappedTags.length > 0) {
        warnings.push(
          `家族の非標準タグはGEDCOM ${sourceVersion}由来のため、${version}へは変換されず保全のみされました`,
        )
      }
    }
  }

  const personIdToXref = new Map<string, string>()
  data.people.forEach((person, index) => {
    personIdToXref.set(person.id, `I${index + 1}`)
  })
  const familyIdToXref = new Map<string, string>()
  data.families.forEach((family, index) => {
    familyIdToXref.set(family.id, `F${index + 1}`)
  })

  const indiNodes = data.people.map((person) =>
    personToIndiNode(
      person,
      personIdToXref,
      familyIdToXref,
      data.families,
      version,
    ),
  )
  const famNodes = data.families.map((family) =>
    familyToFamNode(family, personIdToXref, familyIdToXref, version, warnings),
  )

  const roots: GedcomNode[] = [
    buildHeader(version),
    ...indiNodes,
    ...famNodes,
    { tag: 'TRLR', children: [] },
  ]

  return { text: serializeGedcomTree(roots), warnings }
}

/** UTF-8(BOM付き)のバイト列へエンコードする(design.md D6: エクスポートは常にBOM付きUTF-8)。 */
export function encodeGedcomTextToBytes(text: string): Uint8Array {
  const bom = new Uint8Array([0xef, 0xbb, 0xbf])
  const body = new TextEncoder().encode(text)
  const combined = new Uint8Array(bom.length + body.length)
  combined.set(bom, 0)
  combined.set(body, bom.length)
  return combined
}

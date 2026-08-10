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
import { formatGedcomHeaderDate, fuzzyDateToGedcomNode } from './dateMapping'
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

/**
 * 本アプリが出力し得る独自拡張タグと、その意味を識別するURI(GEDCOM 7.0のSCHMA宣言用)。
 * URIは「タグの定義を示す識別子」であればよいため、現状はリポジトリのREADMEを
 * 仮の識別子とする(タグごとのフラグメントで区別)。
 */
const EXTENSION_TAG_URIS: [string, string][] = [
  [
    '_KANA_SURN',
    'https://github.com/DISK0401/family-tree-generator#_kana_surn',
  ],
  [
    '_KANA_GIVN',
    'https://github.com/DISK0401/family-tree-generator#_kana_givn',
  ],
  ['_FAM_KIND', 'https://github.com/DISK0401/family-tree-generator#_fam_kind'],
  [
    '_BIRTH_ORDER',
    'https://github.com/DISK0401/family-tree-generator#_birth_order',
  ],
  [
    '_TREE_TITLE',
    'https://github.com/DISK0401/family-tree-generator#_tree_title',
  ],
  [
    '_SPOUSE_ROLE_UNKNOWN',
    'https://github.com/DISK0401/family-tree-generator#_spouse_role_unknown',
  ],
]

/** 5.5.1エクスポートで出力する提出者レコードのxref(HEADのSUBM参照先) */
const SUBMITTER_XREF = 'U1'

/**
 * HEADレコードを構築する。5.5.1では規格上の必須要素
 * (SOUR / SUBM参照 / GEDC.FORM / CHAR)を出力し、7.0では使用する拡張タグを
 * SCHMAで宣言する。DATEは両バージョンで出力する(値はドキュメントの更新日時)。
 */
function buildHeader(
  version: GedcomVersion,
  document: TreeDocument,
): GedcomNode {
  const updatedAt = new Date(document.updatedAt)
  // updatedAtが不正な文字列でもエクスポートを止めない(エクスポート日で代替)
  const headerDate = Number.isNaN(updatedAt.getTime()) ? new Date() : updatedAt

  const children: GedcomNode[] = []

  if (version === '5.5.1') {
    children.push({
      tag: 'SOUR',
      value: 'KAKEIZUCHO',
      children: [{ tag: 'NAME', value: '家系図帖', children: [] }],
    })
    children.push({
      tag: 'DATE',
      value: formatGedcomHeaderDate(headerDate),
      children: [],
    })
    children.push({
      tag: 'SUBM',
      value: xrefToPointer(SUBMITTER_XREF),
      children: [],
    })
    children.push({
      tag: 'GEDC',
      children: [
        { tag: 'VERS', value: '5.5.1', children: [] },
        { tag: 'FORM', value: 'LINEAGE-LINKED', children: [] },
      ],
    })
    children.push({ tag: 'CHAR', value: 'UTF-8', children: [] })
  } else {
    children.push({
      tag: 'GEDC',
      children: [{ tag: 'VERS', value: '7.0', children: [] }],
    })
    children.push({
      tag: 'SCHMA',
      children: EXTENSION_TAG_URIS.map(([tag, uri]) => ({
        tag: 'TAG',
        value: `${tag} ${uri}`,
        children: [],
      })),
    })
    children.push({
      tag: 'DATE',
      value: formatGedcomHeaderDate(headerDate),
      children: [],
    })
  }

  children.push({ tag: '_TREE_TITLE', value: document.title, children: [] })
  return { tag: 'HEAD', children }
}

/** 5.5.1で必須の提出者(SUBM)レコード。個人情報を持たない固定値とする。 */
function buildSubmitterRecord(): GedcomNode {
  return {
    tag: 'SUBM',
    xref: SUBMITTER_XREF,
    children: [{ tag: 'NAME', value: '家系図帖の利用者', children: [] }],
  }
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
  const children: GedcomNode[] = []

  // 氏名が完全に空の人物は、空値のNAME行を出さずタグ自体を省略する
  const hasAnyName = Boolean(
    person.name.surname ||
    person.name.given ||
    person.name.surnameKana ||
    person.name.givenKana,
  )
  if (hasAnyName) {
    children.push(personNameToGedcomNode(person.name, version))
  }

  children.push({
    tag: 'SEX',
    value: GENDER_EXPORT[person.gender],
    children: [],
  })

  // 出生順(家族内での出生順、性別非依存)はGEDCOM標準タグに対応がないため、
  // 拡張タグへ退避する(7.0/5.5.1共通。_FAM_KINDと同じ往復パターン)
  if (person.birthOrder !== undefined) {
    children.push({
      tag: '_BIRTH_ORDER',
      value: String(person.birthOrder),
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
      const pedi = pedigreeToPedi(childLink.pedigree, version)
      const famcChildren: GedcomNode[] = []
      if (pedi) {
        famcChildren.push({
          tag: 'PEDI',
          value: pedi.value,
          children: pedi.phrase
            ? [{ tag: 'PHRASE', value: pedi.phrase, children: [] }]
            : [],
        })
      }
      children.push({
        tag: 'FAMC',
        value: xrefToPointer(familyXref),
        children: famcChildren,
      })
    }
  }

  if (person.note) {
    children.push({ tag: 'NOTE', value: person.note, children: [] })
  }

  return { tag: 'INDI', xref: personIdToXref.get(person.id), children }
}

interface SpouseEntry {
  xref: string
  gender: Gender
}

/**
 * HUSB/WIFEの割当を決める。male→HUSB / female→WIFE を優先し、性別で
 * 一意に決められない場合(両者同性・両者不明など)のみ従来どおり登録順
 * (1人目→HUSB、2人目→WIFE)とし、roleUnknown(_SPOUSE_ROLE_UNKNOWN)を立てる。
 *
 * 注意: 性別ベースで割り当てるため、妻→夫の順で登録されたデータは再インポート時に
 * spouseIds の順序が入れ替わる。ドメイン上の意味は配偶者の「集合」で保たれる。
 */
function assignSpouseRoles(entries: SpouseEntry[]): {
  husb?: string
  wife?: string
  roleUnknown: boolean
} {
  if (entries.length === 0) {
    return { roleUnknown: false }
  }

  if (entries.length === 1) {
    const only = entries[0]
    if (only.gender === 'female') {
      return { wife: only.xref, roleUnknown: false }
    }
    if (only.gender === 'male') {
      return { husb: only.xref, roleUnknown: false }
    }
    // 性別不明のひとり親は従来どおりHUSB枠へ入れ、役割未確定として印を付ける
    return { husb: only.xref, roleUnknown: true }
  }

  const [a, b] = entries
  const males = entries.filter((entry) => entry.gender === 'male')
  const females = entries.filter((entry) => entry.gender === 'female')

  if (males.length === 1 && females.length === 1) {
    return { husb: males[0].xref, wife: females[0].xref, roleUnknown: false }
  }
  if (males.length === 1) {
    // male+不明: 判明している側をHUSBへ、残りをWIFE枠へ(役割は未確定)
    const other = entries.find((entry) => entry !== males[0])
    return { husb: males[0].xref, wife: other?.xref, roleUnknown: true }
  }
  if (females.length === 1) {
    const other = entries.find((entry) => entry !== females[0])
    return { husb: other?.xref, wife: females[0].xref, roleUnknown: true }
  }
  // 両者同性・両者不明: 登録順
  return { husb: a.xref, wife: b.xref, roleUnknown: true }
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

  const resolvedSpouses: SpouseEntry[] = []
  for (const spouseId of family.spouseIds) {
    const xref = personIdToXref.get(spouseId)
    if (xref) {
      resolvedSpouses.push({
        xref,
        gender: persons[spouseId]?.gender ?? 'unknown',
      })
    }
  }

  const primary = resolvedSpouses.slice(0, 2)
  const extras = resolvedSpouses.slice(2)
  const { husb, wife, roleUnknown } = assignSpouseRoles(primary)

  if (husb) {
    children.push({ tag: 'HUSB', value: xrefToPointer(husb), children: [] })
  }
  if (wife) {
    children.push({ tag: 'WIFE', value: xrefToPointer(wife), children: [] })
  }
  for (const extra of extras) {
    children.push({
      tag: 'WIFE',
      value: xrefToPointer(extra.xref),
      children: [],
    })
  }
  if (family.spouseIds.length > 2) {
    warnings.push(
      '3名以上のパートナーを持つ家族はGEDCOMの標準構造(HUSB/WIFE 2枠)を超えるため、3人目以降は非標準的に出力されます(再インポート時に失われる可能性があります)',
    )
  }

  if (roleUnknown) {
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
    ...(version === '5.5.1' ? [buildSubmitterRecord()] : []),
    ...indiNodes,
    ...famNodes,
    { tag: 'TRLR', children: [] },
  ]

  return { text: serializeGedcomTree(roots, version), warnings }
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

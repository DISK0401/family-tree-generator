import { describe, expect, it } from 'vitest'
import { createTreeDocument } from '../../domain/helpers'
import {
  addChild,
  addChildLink,
  addFamilyEvent,
  addPerson,
  addSpouse,
  updateFamily,
} from '../../domain/commands'
import { parseDateInput } from '../../domain/parse-date'
import { exportGedcom } from './export'
import { importGedcom } from './import'

function bytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

describe('GEDCOM export→importのラウンドトリップ', () => {
  it('養子・和暦原文・かな表記を含むドキュメントが同一バージョンで意味的に復元される', () => {
    let document = createTreeDocument()
    const bioParent = addPerson(document, {
      name: { surname: '渡邊', given: '一', surnameKana: 'わたなべ' },
    })
    document = bioParent.doc

    const birthDate = parseDateInput('明治10年頃')
    expect(birthDate.ok).toBe(true)
    const child = addChild(document, bioParent.personId, {
      name: { surname: '渡邊', given: '五郎' },
      birth: birthDate.ok
        ? { type: 'birth', date: birthDate.value }
        : undefined,
    })
    document = child.doc

    const adoptiveParent = addPerson(document, { name: { given: '養親' } })
    document = adoptiveParent.doc
    const adoptiveFamily = addSpouse(document, adoptiveParent.personId, {
      name: { given: 'ダミー' },
    })
    document = updateFamily(adoptiveFamily.doc, adoptiveFamily.familyId, {
      kind: 'common-law',
    })
    document = addChildLink(
      document,
      adoptiveFamily.familyId,
      child.childId,
      'adopted',
    )

    const { text } = exportGedcom(document, '5.5.1')
    const reimported = importGedcom(bytesOf(text))

    expect(reimported.success).toBe(true)
    if (!reimported.success) return

    expect(Object.keys(reimported.document.persons)).toHaveLength(4)
    expect(Object.keys(reimported.document.families)).toHaveLength(2)

    // かなを設定した人物のふりがなが復元される(_KANA_*とFONE併記のどちらからでも)
    const reimportedParent = Object.values(reimported.document.persons).find(
      (p) => p.name.given === '一',
    )
    expect(reimportedParent?.name.surnameKana).toBe('わたなべ')

    const reimportedChild = Object.values(reimported.document.persons).find(
      (p) => p.name.given === '五郎',
    )
    expect(reimportedChild?.birth?.date?.original).toBe('明治10年頃')
    expect(reimportedChild?.birth?.date?.date).toEqual({
      year: 1877,
      month: undefined,
      day: undefined,
    })

    const pedigrees = Object.values(reimported.document.families)
      .flatMap((f) => f.children)
      .filter((c) => c.childId === reimportedChild?.id)
      .map((c) => c.pedigree)
    expect(pedigrees).toEqual(expect.arrayContaining(['biological', 'adopted']))

    const commonLawFamily = Object.values(reimported.document.families).find(
      (f) => f.kind === 'common-law',
    )
    expect(commonLawFamily).toBeDefined()
  })
})

describe('出生順(birthOrder)の往復(issue #49)', () => {
  it('出生順が設定された兄弟が、7.0/5.5.1いずれのバージョンでも値を保ったまま往復する', () => {
    for (const version of ['7.0', '5.5.1'] as const) {
      let document = createTreeDocument()
      const parent = addPerson(document, { name: { given: '親' } })
      document = parent.doc
      const c1 = addChild(document, parent.personId, {
        name: { given: '一郎' },
        birthOrder: 1,
      })
      document = c1.doc
      // parentの配偶者参照1件のみの家族は既存のものが再利用されるため、c1と同じ家族に属する
      const c2 = addChild(document, parent.personId, {
        name: { given: '二郎' },
        birthOrder: 2,
      })
      document = c2.doc

      const { text } = exportGedcom(document, version)
      const reimported = importGedcom(bytesOf(text))

      expect(reimported.success).toBe(true)
      if (!reimported.success) continue

      const reimportedC1 = Object.values(reimported.document.persons).find(
        (p) => p.name.given === '一郎',
      )
      const reimportedC2 = Object.values(reimported.document.persons).find(
        (p) => p.name.given === '二郎',
      )
      expect(reimportedC1?.birthOrder).toBe(1)
      expect(reimportedC2?.birthOrder).toBe(2)
    }
  })
})

describe('GEDCOM 7.0の完全ラウンドトリップ', () => {
  it('氏名+かな+場所+複数イベント+長文NOTE+和暦PHRASE+養子が復元される', () => {
    const longNote = `代々の来歴に関する長いメモ。${'家伝の記録による補足。'.repeat(30)}`
    expect(longNote.length).toBeGreaterThan(200)

    let document = createTreeDocument({ title: '七〇検証家系図' })
    const husband = addPerson(document, {
      name: {
        surname: '齋藤',
        given: '榮吉',
        surnameKana: 'さいとう',
        givenKana: 'えいきち',
      },
      gender: 'male',
      birth: (() => {
        const parsed = parseDateInput('明治10年頃')
        return parsed.ok
          ? { type: 'birth' as const, date: parsed.value }
          : undefined
      })(),
      death: {
        type: 'death',
        date: {
          original: '1950年3月15日',
          qualifier: 'exact',
          date: { year: 1950, month: 3, day: 15 },
        },
        place: '東京都新宿区',
      },
      note: longNote,
    })
    document = husband.doc

    const wife = addSpouse(document, husband.personId, {
      name: { surname: '齋藤', given: '花', surnameKana: 'さいとう' },
      gender: 'female',
    })
    document = updateFamily(wife.doc, wife.familyId, { kind: 'married' })

    // 復縁: 婚姻→離婚→婚姻(日付なし)
    document = addFamilyEvent(document, wife.familyId, {
      type: 'marriage',
      place: '東京府',
    })
    document = addFamilyEvent(document, wife.familyId, {
      type: 'divorce',
    })
    document = addFamilyEvent(document, wife.familyId, {
      type: 'marriage',
    })

    const child = addChild(
      document,
      husband.personId,
      { name: { surname: '齋藤', given: '実子' } },
      { otherParentId: wife.spouseId },
    )
    document = child.doc

    const adoptiveParent = addPerson(document, {
      name: { given: '養親' },
      gender: 'female',
    })
    document = adoptiveParent.doc
    const adoptiveFamily = addSpouse(document, adoptiveParent.personId, {
      name: { given: '養親配偶者' },
    })
    document = adoptiveFamily.doc
    document = addChildLink(
      document,
      adoptiveFamily.familyId,
      child.childId,
      'adopted',
    )

    const { text } = exportGedcom(document, '7.0')
    const reimported = importGedcom(bytesOf(text))

    expect(reimported.success).toBe(true)
    if (!reimported.success) return

    expect(reimported.document.title).toBe('七〇検証家系図')

    const persons = Object.values(reimported.document.persons)
    expect(persons).toHaveLength(5)

    const reHusband = persons.find((p) => p.name.given === '榮吉')
    expect(reHusband?.name).toEqual({
      surname: '齋藤',
      given: '榮吉',
      surnameKana: 'さいとう',
      givenKana: 'えいきち',
    })
    expect(reHusband?.gender).toBe('male')
    expect(reHusband?.birth?.date?.original).toBe('明治10年頃')
    expect(reHusband?.birth?.date?.qualifier).toBe('about')
    expect(reHusband?.death?.date?.date).toEqual({
      year: 1950,
      month: 3,
      day: 15,
    })
    expect(reHusband?.death?.place).toBe('東京都新宿区')
    // 長文NOTEが欠損なく復元される(7.0はCONC分割なしの1行+CONTなし)
    expect(reHusband?.note).toBe(longNote)

    // 復縁の時系列(婚姻→離婚→婚姻)が保たれる
    const mainFamily = Object.values(reimported.document.families).find(
      (f) => f.kind === 'married',
    )
    expect(mainFamily?.events.map((e) => e.type)).toEqual([
      'marriage',
      'divorce',
      'marriage',
    ])
    expect(mainFamily?.events[0].place).toBe('東京府')

    // 実子と養子の両方の続柄が保たれる
    const reChild = persons.find((p) => p.name.given === '実子')
    const childPedigrees = Object.values(reimported.document.families)
      .flatMap((f) => f.children)
      .filter((c) => c.childId === reChild?.id)
      .map((c) => c.pedigree)
    expect(childPedigrees).toEqual(
      expect.arrayContaining(['biological', 'adopted']),
    )
  })

  it('続柄step/unknownが7.0経由の往復でPHRASEにより判別され、共に保たれる', () => {
    let document = createTreeDocument()
    const parent = addPerson(document, { name: { given: '親' } })
    document = parent.doc
    const stepChild = addChild(document, parent.personId, {
      name: { given: '継子側' },
    })
    document = stepChild.doc
    const unknownChild = addChild(document, parent.personId, {
      name: { given: '不明側' },
    })
    document = unknownChild.doc
    // 同一家族の子2名へ step / unknown をそれぞれ設定する
    document = {
      ...document,
      families: Object.fromEntries(
        Object.entries(document.families).map(([id, family]) => [
          id,
          {
            ...family,
            children: family.children.map((link) => ({
              ...link,
              pedigree:
                link.childId === stepChild.childId
                  ? ('step' as const)
                  : ('unknown' as const),
            })),
          },
        ]),
      ),
    }

    const { text } = exportGedcom(document, '7.0')
    // どちらも規格内のOTHERへ丸められ、PHRASEで判別される
    expect(text).toContain('2 PEDI OTHER')
    expect(text).toContain('3 PHRASE 継子')
    expect(text).toContain('3 PHRASE 続柄不明')

    const reimported = importGedcom(bytesOf(text))

    expect(reimported.success).toBe(true)
    if (!reimported.success) return
    const family = Object.values(reimported.document.families)[0]
    const pedigreeByName = new Map(
      family.children.map((link) => [
        reimported.document.persons[link.childId]?.name.given,
        link.pedigree,
      ]),
    )
    expect(pedigreeByName.get('継子側')).toBe('step')
    expect(pedigreeByName.get('不明側')).toBe('unknown')
    // PHRASEで判別できているためOTHERに関する警告は出ない
    expect(reimported.warnings.some((w) => w.message.includes('OTHER'))).toBe(
      false,
    )
  })

  it('続柄stepは5.5.1経由の往復ではunknown+警告へ劣化する(許容済みの劣化)', () => {
    let document = createTreeDocument()
    const parent = addPerson(document, { name: { given: '親' } })
    document = parent.doc
    const child = addChild(document, parent.personId, {
      name: { given: '継子' },
    })
    document = child.doc
    document = {
      ...document,
      families: Object.fromEntries(
        Object.entries(document.families).map(([id, family]) => [
          id,
          {
            ...family,
            children: family.children.map((link) => ({
              ...link,
              pedigree: 'step' as const,
            })),
          },
        ]),
      ),
    }

    const { text } = exportGedcom(document, '5.5.1')
    // 5.5.1は従来どおり独自値otherを出力する(後方互換。PHRASEは5.5.1に無い)
    expect(text).toContain('2 PEDI other')
    expect(text).not.toContain('PHRASE')

    const reimported = importGedcom(bytesOf(text))

    expect(reimported.success).toBe(true)
    if (!reimported.success) return
    const family = Object.values(reimported.document.families)[0]
    // PHRASEによる判別ができないため step は unknown へ劣化する(警告で通知)
    expect(family.children[0].pedigree).toBe('unknown')
    expect(
      reimported.warnings.some((w) =>
        w.message.includes('続柄 OTHER は『不明』として取り込みました'),
      ),
    ).toBe(true)
  })
})

describe('配偶者の順序と役割の往復', () => {
  it('妻→夫の順で登録された家族は順序が入れ替わり得るが配偶者集合は保たれる', () => {
    let document = createTreeDocument()
    const wifeFirst = addPerson(document, {
      name: { surname: '山田', given: '花子' },
      gender: 'female',
    })
    document = wifeFirst.doc
    const family = addSpouse(document, wifeFirst.personId, {
      name: { surname: '山田', given: '太郎' },
      gender: 'male',
    })
    document = family.doc

    const { text } = exportGedcom(document, '7.0')
    const reimported = importGedcom(bytesOf(text))

    expect(reimported.success).toBe(true)
    if (!reimported.success) return

    const reFamily = Object.values(reimported.document.families)[0]
    const spouseNames = reFamily.spouseIds
      .map((id) => reimported.document.persons[id]?.name.given)
      .sort()
    // 順序は性別ベース割当(HUSB/WIFE)により入れ替わり得るため、集合として比較する
    expect(spouseNames).toEqual(['太郎', '花子'])
  })
})

describe('FAMイベント順序の往復', () => {
  it('日付なしの婚姻→離婚→婚姻(復縁)がexport→importで順序保持される', () => {
    let document = createTreeDocument()
    const a = addPerson(document, { name: { given: 'A' } })
    document = a.doc
    const family = addSpouse(document, a.personId, { name: { given: 'B' } })
    document = family.doc
    document = addFamilyEvent(document, family.familyId, { type: 'marriage' })
    document = addFamilyEvent(document, family.familyId, { type: 'divorce' })
    document = addFamilyEvent(document, family.familyId, { type: 'marriage' })

    for (const version of ['5.5.1', '7.0'] as const) {
      const { text } = exportGedcom(document, version)
      const reimported = importGedcom(bytesOf(text))

      expect(reimported.success).toBe(true)
      if (!reimported.success) return

      const reFamily = Object.values(reimported.document.families)[0]
      // 復縁が「離婚済み」に反転しない
      expect(reFamily.events.map((e) => e.type)).toEqual([
        'marriage',
        'divorce',
        'marriage',
      ])
    }
  })
})

describe('特殊文字を含む値の往復', () => {
  it('先頭が@のメモ・改行/復帰文字を含むメモが安全に往復する', () => {
    let document = createTreeDocument()
    const person = addPerson(document, {
      name: { given: 'メモ持ち' },
      note: '@先頭アットマーク\r\n二行目\rさらに0 @X@ INDIという行',
    })
    document = person.doc

    for (const version of ['5.5.1', '7.0'] as const) {
      const { text } = exportGedcom(document, version)
      const reimported = importGedcom(bytesOf(text))

      expect(reimported.success).toBe(true)
      if (!reimported.success) return

      // 偽のINDIレコードが注入されない
      expect(Object.keys(reimported.document.persons)).toHaveLength(1)
      const restored = Object.values(reimported.document.persons)[0]
      // \r\n・\rは\nへ正規化されて保全される
      expect(restored.note).toBe(
        '@先頭アットマーク\n二行目\nさらに0 @X@ INDIという行',
      )
    }
  })
})

describe('関係を持たない人物のラウンドトリップ', () => {
  it('どのFamilyにも属さない人物がFAMS/FAMCなしのINDIとして出力され、復元される', () => {
    let document = createTreeDocument()
    const a = addPerson(document, { name: { surname: '山田', given: '太郎' } })
    document = a.doc
    const spouse = addSpouse(document, a.personId, {
      name: { surname: '山田', given: '花子' },
    })
    document = spouse.doc
    // 系統を決めずに先に登録した人物(旧字体を含む)
    const standalone = addPerson(document, {
      name: { surname: '富岡', given: '榮' },
    })
    document = standalone.doc

    const { text } = exportGedcom(document, '7.0')

    // 当該INDIレコードには家族参照が出力されない
    const records = text.split(/\r?\n(?=0 @)/)
    const standaloneRecord = records.find((r) => r.includes('榮'))
    expect(standaloneRecord).toBeDefined()
    expect(standaloneRecord).not.toContain('FAMS')
    expect(standaloneRecord).not.toContain('FAMC')

    const reimported = importGedcom(bytesOf(text))
    expect(reimported.success).toBe(true)
    if (!reimported.success) return

    expect(Object.keys(reimported.document.persons)).toHaveLength(3)
    const restored = Object.values(reimported.document.persons).find(
      (p) => p.name.given === '榮',
    )
    expect(restored).toBeDefined()
    // どのFamilyにも属さないまま復元される
    const belongs = Object.values(reimported.document.families).some(
      (f) =>
        f.spouseIds.includes(restored?.id ?? '') ||
        f.children.some((c) => c.childId === restored?.id),
    )
    expect(belongs).toBe(false)
  })
})

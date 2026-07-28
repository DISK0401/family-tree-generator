import { describe, expect, it } from 'vitest'
import { importGedcom } from './import'

function bytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

describe('importGedcom GEDCOM 7.0ファイルのインポート', () => {
  it('バージョンを自動判定し人物・家族をTreeDocumentへ変換する', () => {
    const text = [
      '0 HEAD',
      '1 GEDC',
      '2 VERS 7.0',
      '0 @I1@ INDI',
      '1 NAME 太郎 /山田/',
      '2 GIVN 太郎',
      '2 SURN 山田',
      '1 SEX M',
      '1 BIRT',
      '2 DATE 7 JAN 1900',
      '0 @I2@ INDI',
      '1 NAME 花子 /山田/',
      '1 SEX F',
      '0 @F1@ FAM',
      '1 HUSB @I1@',
      '1 WIFE @I2@',
      '1 MARR',
      '0 TRLR',
    ].join('\n')

    const result = importGedcom(bytesOf(text))

    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.version).toBe('7.0')
    expect(Object.keys(result.document.persons)).toHaveLength(2)
    expect(Object.keys(result.document.families)).toHaveLength(1)

    const family = Object.values(result.document.families)[0]
    expect(family.spouseIds).toHaveLength(2)
    expect(family.kind).toBe('married')

    const taro = Object.values(result.document.persons).find(
      (p) => p.name.given === '太郎',
    )
    expect(taro?.gender).toBe('male')
    expect(taro?.birth?.date?.date).toEqual({ year: 1900, month: 1, day: 7 })

    // SURN/GIVNサブタグを持たない花子もNAME行値から姓名が補完される
    const hanako = Object.values(result.document.persons).find(
      (p) => p.name.given === '花子',
    )
    expect(hanako).toBeDefined()
    expect(hanako?.name.surname).toBe('山田')
  })
})

describe('importGedcom GEDCOM 5.5.1ファイルのインポート', () => {
  it('拡張タグ_KANA_SURN/_KANA_GIVNから読み仮名をTreeDocumentへ変換する', () => {
    const text = [
      '0 HEAD',
      '1 GEDC',
      '2 VERS 5.5.1',
      '1 CHAR UTF-8',
      '0 @I1@ INDI',
      '1 NAME 太郎 /山田/',
      '2 SURN 山田',
      '2 GIVN 太郎',
      '2 _KANA_SURN やまだ',
      '2 _KANA_GIVN たろう',
      '0 TRLR',
    ].join('\n')

    const result = importGedcom(bytesOf(text))

    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.version).toBe('5.5.1')
    const person = Object.values(result.document.persons)[0]
    expect(person.name.surnameKana).toBe('やまだ')
    expect(person.name.givenKana).toBe('たろう')
  })
})

describe('importGedcom GEDCOMとして解釈できないファイル', () => {
  it('HEADが見つからない場合はインポートを中断する', () => {
    const text = ['this is not gedcom at all', 'just plain text'].join('\n')

    const result = importGedcom(bytesOf(text))

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.reason).toContain('HEAD')
  })
})

describe('importGedcom 養子縁組を含むファイルのインポート', () => {
  it('PEDI ADOPTEDを続柄「養子」に変換する', () => {
    const text = [
      '0 HEAD',
      '1 GEDC',
      '2 VERS 7.0',
      '0 @I1@ INDI',
      '1 NAME Child /Test/',
      '1 FAMC @F1@',
      '2 PEDI ADOPTED',
      '0 @I2@ INDI',
      '1 NAME Parent /Test/',
      '0 @F1@ FAM',
      '1 HUSB @I2@',
      '1 CHIL @I1@',
      '0 TRLR',
    ].join('\n')

    const result = importGedcom(bytesOf(text))

    expect(result.success).toBe(true)
    if (!result.success) return

    const family = Object.values(result.document.families)[0]
    expect(family.children[0].pedigree).toBe('adopted')
  })

  it('PEDI SEALINGは「不明」として取り込み警告を出す', () => {
    const text = [
      '0 HEAD',
      '1 GEDC',
      '2 VERS 7.0',
      '0 @I1@ INDI',
      '1 NAME Child /Test/',
      '1 FAMC @F1@',
      '2 PEDI SEALING',
      '0 @I2@ INDI',
      '1 NAME Parent /Test/',
      '0 @F1@ FAM',
      '1 HUSB @I2@',
      '1 CHIL @I1@',
      '0 TRLR',
    ].join('\n')

    const result = importGedcom(bytesOf(text))

    expect(result.success).toBe(true)
    if (!result.success) return

    const family = Object.values(result.document.families)[0]
    expect(family.children[0].pedigree).toBe('unknown')
    expect(result.warnings.some((w) => w.message.includes('SEALING'))).toBe(
      true,
    )
  })

  it('PEDI OTHERはPHRASEで判別する(継子→step / 続柄不明→unknown)', () => {
    const text = [
      '0 HEAD',
      '1 GEDC',
      '2 VERS 7.0',
      '0 @I1@ INDI',
      '1 NAME StepChild /Test/',
      '1 FAMC @F1@',
      '2 PEDI OTHER',
      '3 PHRASE 継子',
      '0 @I2@ INDI',
      '1 NAME UnknownChild /Test/',
      '1 FAMC @F1@',
      '2 PEDI OTHER',
      '3 PHRASE 続柄不明',
      '0 @I3@ INDI',
      '1 NAME Parent /Test/',
      '0 @F1@ FAM',
      '1 HUSB @I3@',
      '1 CHIL @I1@',
      '1 CHIL @I2@',
      '0 TRLR',
    ].join('\n')

    const result = importGedcom(bytesOf(text))

    expect(result.success).toBe(true)
    if (!result.success) return

    const family = Object.values(result.document.families)[0]
    expect(family.children.map((c) => c.pedigree)).toEqual(['step', 'unknown'])
    // PHRASEで判別できているため警告は出ない
    expect(result.warnings.some((w) => w.message.includes('OTHER'))).toBe(false)
  })

  it('PHRASEのないPEDI OTHERは「不明」として取り込み警告を出す', () => {
    const text = [
      '0 HEAD',
      '1 GEDC',
      '2 VERS 7.0',
      '0 @I1@ INDI',
      '1 NAME Child /Test/',
      '1 FAMC @F1@',
      '2 PEDI OTHER',
      '0 @I2@ INDI',
      '1 NAME Parent /Test/',
      '0 @F1@ FAM',
      '1 HUSB @I2@',
      '1 CHIL @I1@',
      '0 TRLR',
    ].join('\n')

    const result = importGedcom(bytesOf(text))

    expect(result.success).toBe(true)
    if (!result.success) return

    const family = Object.values(result.document.families)[0]
    expect(family.children[0].pedigree).toBe('unknown')
    expect(
      result.warnings.some((w) =>
        w.message.includes('続柄 OTHER は『不明』として取り込みました'),
      ),
    ).toBe(true)
  })
})

describe('importGedcom ANUL(婚姻取消)の取り込み', () => {
  it('ANULを離婚イベントとして取り込み警告を出す', () => {
    const text = [
      '0 HEAD',
      '1 GEDC',
      '2 VERS 7.0',
      '0 @I1@ INDI',
      '1 NAME A /Test/',
      '0 @I2@ INDI',
      '1 NAME B /Test/',
      '0 @F1@ FAM',
      '1 HUSB @I1@',
      '1 WIFE @I2@',
      '1 ANUL',
      '0 TRLR',
    ].join('\n')

    const result = importGedcom(bytesOf(text))

    expect(result.success).toBe(true)
    if (!result.success) return

    const family = Object.values(result.document.families)[0]
    expect(family.events).toEqual([
      { type: 'divorce', date: undefined, place: undefined },
    ])
    expect(result.warnings.some((w) => w.tag === 'ANUL')).toBe(true)
  })
})

describe('importGedcom FAMイベントの文書順取り込み', () => {
  it('日付なしのMARR/DIV/MARR(復縁)が文書の順序どおりにeventsへ入る', () => {
    const text = [
      '0 HEAD',
      '1 GEDC',
      '2 VERS 7.0',
      '0 @I1@ INDI',
      '1 NAME A /Test/',
      '0 @I2@ INDI',
      '1 NAME B /Test/',
      '0 @F1@ FAM',
      '1 HUSB @I1@',
      '1 WIFE @I2@',
      '1 MARR',
      '1 DIV',
      '1 MARR',
      '0 TRLR',
    ].join('\n')

    const result = importGedcom(bytesOf(text))

    expect(result.success).toBe(true)
    if (!result.success) return

    const family = Object.values(result.document.families)[0]
    expect(family.events.map((e) => e.type)).toEqual([
      'marriage',
      'divorce',
      'marriage',
    ])
  })
})

describe('importGedcom 警告付きインポートの成立', () => {
  it('解釈できない行があってもインポート自体は成立し警告に含まれる', () => {
    const text = [
      '0 HEAD',
      '1 GEDC',
      '2 VERS 7.0',
      '0 @I1@ INDI',
      '1 NAME Only /Person/',
      'this line is not valid gedcom syntax',
      '0 TRLR',
    ].join('\n')

    const result = importGedcom(bytesOf(text))

    expect(result.success).toBe(true)
    if (!result.success) return

    expect(Object.keys(result.document.persons)).toHaveLength(1)
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it('解決できないCHIL参照は親子関係として取り込まず警告を出す', () => {
    const text = [
      '0 HEAD',
      '1 GEDC',
      '2 VERS 7.0',
      '0 @I1@ INDI',
      '1 NAME Parent /Test/',
      '0 @F1@ FAM',
      '1 HUSB @I1@',
      '1 CHIL @I999@',
      '0 TRLR',
    ].join('\n')

    const result = importGedcom(bytesOf(text))

    expect(result.success).toBe(true)
    if (!result.success) return

    const family = Object.values(result.document.families)[0]
    // ダングリング参照のChildLinkを作らない
    expect(family.children).toHaveLength(0)
    const warning = result.warnings.find((w) => w.tag === 'CHIL')
    expect(warning?.message).toContain('@I999@')
    expect(warning?.message).toContain('取り込みませんでした')
  })

  it('解決できないHUSB/WIFE参照も警告を出して除外する', () => {
    const text = [
      '0 HEAD',
      '1 GEDC',
      '2 VERS 7.0',
      '0 @I1@ INDI',
      '1 NAME Wife /Test/',
      '0 @F1@ FAM',
      '1 HUSB @I999@',
      '1 WIFE @I1@',
      '0 TRLR',
    ].join('\n')

    const result = importGedcom(bytesOf(text))

    expect(result.success).toBe(true)
    if (!result.success) return

    const family = Object.values(result.document.families)[0]
    expect(family.spouseIds).toHaveLength(1)
    const warning = result.warnings.find((w) => w.tag === 'HUSB')
    expect(warning?.message).toContain('@I999@')
    expect(warning?.message).toContain('配偶者として取り込みませんでした')
  })
})

describe('importGedcom 未対応タグの要約警告', () => {
  it('INDI直下の未知タグをレコード単位で集計して警告する', () => {
    const text = [
      '0 HEAD',
      '1 GEDC',
      '2 VERS 5.5.1',
      '0 @I1@ INDI',
      '1 NAME Taro /Yamada/',
      '1 OCCU Farmer',
      '1 RESI',
      '2 ADDR Tokyo',
      '1 OCCU Merchant',
      '0 TRLR',
    ].join('\n')

    const result = importGedcom(bytesOf(text))

    expect(result.success).toBe(true)
    if (!result.success) return

    const summary = result.warnings.find((w) =>
      w.message.includes('読み飛ばしました'),
    )
    expect(summary?.message).toContain('@I1@')
    expect(summary?.message).toContain('OCCU')
    expect(summary?.message).toContain('RESI')
    expect(summary?.message).toContain('3項目')
  })

  it('取り込むイベント直下の未知タグ(SOUR引用等)も集計される', () => {
    const text = [
      '0 HEAD',
      '1 GEDC',
      '2 VERS 5.5.1',
      '0 @I1@ INDI',
      '1 NAME Taro /Yamada/',
      '1 BIRT',
      '2 DATE 1 JAN 1900',
      '2 SOUR @S1@',
      '0 TRLR',
    ].join('\n')

    const result = importGedcom(bytesOf(text))

    expect(result.success).toBe(true)
    if (!result.success) return

    const summary = result.warnings.find((w) =>
      w.message.includes('読み飛ばしました'),
    )
    expect(summary?.message).toContain('BIRT>SOUR')
  })

  it('本アプリのエクスポートに含まれる既知タグ(SUBM等)は警告しない', () => {
    const text = [
      '0 HEAD',
      '1 SOUR KAKEIZUCHO',
      '2 NAME 家系図帖',
      '1 DATE 28 JUL 2026',
      '1 SUBM @U1@',
      '1 GEDC',
      '2 VERS 5.5.1',
      '2 FORM LINEAGE-LINKED',
      '1 CHAR UTF-8',
      '0 @U1@ SUBM',
      '1 NAME 家系図帖の利用者',
      '0 @I1@ INDI',
      '1 NAME Taro /Yamada/',
      '1 SEX M',
      '0 TRLR',
    ].join('\n')

    const result = importGedcom(bytesOf(text))

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.warnings).toHaveLength(0)
  })
})

describe('importGedcom 拡張タグ・特殊値の取り扱い', () => {
  it('_SPOUSE_ROLE_UNKNOWNを読んだら続柄未確定の警告を出す', () => {
    const text = [
      '0 HEAD',
      '1 GEDC',
      '2 VERS 7.0',
      '0 @I1@ INDI',
      '1 NAME A /Test/',
      '0 @I2@ INDI',
      '1 NAME B /Test/',
      '0 @F1@ FAM',
      '1 HUSB @I1@',
      '1 WIFE @I2@',
      '1 _SPOUSE_ROLE_UNKNOWN Y',
      '0 TRLR',
    ].join('\n')

    const result = importGedcom(bytesOf(text))

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(
      result.warnings.some((w) =>
        w.message.includes('配偶者の続柄(夫/妻)が確定していない'),
      ),
    ).toBe(true)
  })

  it('SEX Xは「不明」として取り込み警告を出す', () => {
    const text = [
      '0 HEAD',
      '1 GEDC',
      '2 VERS 7.0',
      '0 @I1@ INDI',
      '1 NAME X /Test/',
      '1 SEX X',
      '0 TRLR',
    ].join('\n')

    const result = importGedcom(bytesOf(text))

    expect(result.success).toBe(true)
    if (!result.success) return

    const person = Object.values(result.document.persons)[0]
    expect(person.gender).toBe('unknown')
    expect(
      result.warnings.some((w) =>
        w.message.includes('性別 X は『不明』として取り込みました'),
      ),
    ).toBe(true)
  })
})

describe('importGedcom 重複データの整理', () => {
  it('同一xrefのINDI再定義は後勝ちで取り込み警告を出す', () => {
    const text = [
      '0 HEAD',
      '1 GEDC',
      '2 VERS 7.0',
      '0 @I1@ INDI',
      '1 NAME Old /Name/',
      '0 @I1@ INDI',
      '1 NAME New /Name/',
      '0 TRLR',
    ].join('\n')

    const result = importGedcom(bytesOf(text))

    expect(result.success).toBe(true)
    if (!result.success) return

    const persons = Object.values(result.document.persons)
    expect(persons).toHaveLength(1)
    expect(persons[0].name.given).toBe('New')
    expect(result.warnings.some((w) => w.message.includes('複数回定義'))).toBe(
      true,
    )
  })

  it('同一FAM内の重複CHILは1件にまとめて警告を出す', () => {
    const text = [
      '0 HEAD',
      '1 GEDC',
      '2 VERS 7.0',
      '0 @I1@ INDI',
      '1 NAME Parent /Test/',
      '0 @I2@ INDI',
      '1 NAME Child /Test/',
      '0 @F1@ FAM',
      '1 HUSB @I1@',
      '1 CHIL @I2@',
      '1 CHIL @I2@',
      '0 TRLR',
    ].join('\n')

    const result = importGedcom(bytesOf(text))

    expect(result.success).toBe(true)
    if (!result.success) return

    const family = Object.values(result.document.families)[0]
    expect(family.children).toHaveLength(1)
    expect(result.warnings.some((w) => w.message.includes('重複'))).toBe(true)
  })

  it('HUSBとWIFEが同一人物を指す場合は1名の配偶者にまとめて警告を出す', () => {
    const text = [
      '0 HEAD',
      '1 GEDC',
      '2 VERS 7.0',
      '0 @I1@ INDI',
      '1 NAME Solo /Test/',
      '0 @F1@ FAM',
      '1 HUSB @I1@',
      '1 WIFE @I1@',
      '0 TRLR',
    ].join('\n')

    const result = importGedcom(bytesOf(text))

    expect(result.success).toBe(true)
    if (!result.success) return

    const family = Object.values(result.document.families)[0]
    expect(family.spouseIds).toHaveLength(1)
    expect(result.warnings.some((w) => w.message.includes('同一人物'))).toBe(
      true,
    )
  })
})

describe('importGedcom 警告の上限', () => {
  it('警告が100件を超えると打ち切り、残件数を最後に足す', () => {
    const unknownRecords = Array.from(
      { length: 130 },
      (_, i) => `0 @X${i}@ _UNKNOWN_RECORD`,
    )
    const text = [
      '0 HEAD',
      '1 GEDC',
      '2 VERS 7.0',
      ...unknownRecords,
      '0 TRLR',
    ].join('\n')

    const result = importGedcom(bytesOf(text))

    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.warnings).toHaveLength(101)
    expect(result.warnings[100].message).toBe('ほか 30 件の警告があります')
  })
})

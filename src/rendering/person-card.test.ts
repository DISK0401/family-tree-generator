import { describe, expect, it } from 'vitest'
import { DEFAULT_VISIBLE_CARD_FIELDS } from '../settings/display-settings'
import type { CardFieldVisibility } from '../settings/display-settings'
import {
  derivePersonCardView,
  personCardInnerHtml,
  personToCardInput,
  type CardDisplaySettings,
  type PersonCardInput,
} from './person-card'

function baseInput(overrides: Partial<PersonCardInput> = {}): PersonCardInput {
  return {
    personId: 'p1',
    gender: 'M',
    surname: '山田',
    given: '太郎',
    surnameKana: 'やまだ',
    givenKana: 'たろう',
    birthDate: { year: 1990, month: 4, day: 1 },
    deathDate: undefined,
    birthPlace: '東京都',
    deathPlace: undefined,
    age: 36,
    deathYear: undefined,
    deceased: false,
    ...overrides,
  }
}

function baseSettings(overrides: Partial<CardDisplaySettings> = {}): CardDisplaySettings {
  return {
    birthDateGranularity: 'full',
    deathDateGranularity: 'full',
    calendarMode: 'gregorian',
    visibleCardFields: DEFAULT_VISIBLE_CARD_FIELDS,
    ...overrides,
  }
}

function fields(overrides: Partial<CardFieldVisibility>): CardFieldVisibility {
  return { ...DEFAULT_VISIBLE_CARD_FIELDS, ...overrides }
}

describe('derivePersonCardView: 表示項目の選択', () => {
  it('既定設定では姓・名・生年月日・年齢・性別アイコンが出て、ふりがな・生没地は出ない', () => {
    const view = derivePersonCardView(baseInput(), baseSettings())
    expect(view.surname).toBe('山田')
    expect(view.given).toBe('太郎')
    expect(view.years).toBe('1990-04-01')
    expect(view.ageLabel).toBe('(36歳)')
    expect(view.showGenderIcon).toBe(true)
    expect(view.kana).toBeUndefined()
    expect(view.places).toBeUndefined()
  })

  it('姓を非表示にすると名のみになる(spec: 表示項目の設定が両方のモードへ効く)', () => {
    const view = derivePersonCardView(baseInput(), baseSettings({ visibleCardFields: fields({ surname: false }) }))
    expect(view.surname).toBeUndefined()
    expect(view.given).toBe('太郎')
  })

  it('名を非表示にすると姓のみになる', () => {
    const view = derivePersonCardView(baseInput(), baseSettings({ visibleCardFields: fields({ given: false }) }))
    expect(view.surname).toBe('山田')
    expect(view.given).toBeUndefined()
  })

  it('ふりがなをオンにすると姓名のかなを結合した文字列になる', () => {
    const view = derivePersonCardView(baseInput(), baseSettings({ visibleCardFields: fields({ furigana: true }) }))
    expect(view.kana).toBe('やまだ たろう')
  })

  it('生年月日を非表示にすると年欄から除外される', () => {
    const view = derivePersonCardView(
      baseInput({ deathDate: { year: 2050, month: 1, day: 1 } }),
      baseSettings({ visibleCardFields: fields({ birthDate: false, deathDate: true }) }),
    )
    expect(view.years).toBe('2050-01-01')
  })

  it('生年月日・没年月日の両方が出るときは en dash で結合される', () => {
    const view = derivePersonCardView(
      baseInput({ deathDate: { year: 2050, month: 1, day: 1 } }),
      baseSettings({ visibleCardFields: fields({ deathDate: true }) }),
    )
    expect(view.years).toBe('1990-04-01 – 2050-01-01')
  })

  it('年齢を非表示にするとageLabelが出ない', () => {
    const view = derivePersonCardView(baseInput(), baseSettings({ visibleCardFields: fields({ age: false }) }))
    expect(view.ageLabel).toBeUndefined()
  })

  it('年齢がデータとして欠損している場合はageが表示対象でもageLabelが出ない', () => {
    const view = derivePersonCardView(baseInput({ age: undefined }), baseSettings())
    expect(view.ageLabel).toBeUndefined()
  })

  it('没年が記録されている場合は「没」付きの年齢になる', () => {
    const view = derivePersonCardView(
      baseInput({ deathYear: 2050, age: 60, deceased: true }),
      baseSettings(),
    )
    expect(view.ageLabel).toBe('(没60歳)')
  })

  it('出生地・没地を表示設定でオンにすると "/" 区切りで結合される', () => {
    const view = derivePersonCardView(
      baseInput({ deathPlace: '大阪府' }),
      baseSettings({ visibleCardFields: fields({ birthPlace: true, deathPlace: true }) }),
    )
    expect(view.places).toBe('東京都 / 大阪府')
  })

  it('性別アイコンをオフにできる', () => {
    const view = derivePersonCardView(baseInput(), baseSettings({ visibleCardFields: fields({ genderIcon: false }) }))
    expect(view.showGenderIcon).toBe(false)
  })

  it('故人フラグはそのまま反映される', () => {
    const view = derivePersonCardView(baseInput({ deceased: true }), baseSettings())
    expect(view.deceased).toBe(true)
  })
})

describe('derivePersonCardView: 表示粒度(design.md D9)', () => {
  it('粒度が year のときは年のみになる', () => {
    const view = derivePersonCardView(baseInput(), baseSettings({ birthDateGranularity: 'year' }))
    expect(view.years).toBe('1990')
  })

  it('粒度が year-month のときは年月になる', () => {
    const view = derivePersonCardView(baseInput(), baseSettings({ birthDateGranularity: 'year-month' }))
    expect(view.years).toBe('1990-04')
  })

  it('粒度が full のときは年月日になる', () => {
    const view = derivePersonCardView(baseInput(), baseSettings({ birthDateGranularity: 'full' }))
    expect(view.years).toBe('1990-04-01')
  })
})

describe('derivePersonCardView: 和暦/西暦(design.md D4)', () => {
  it('和暦表示モードでは生年月日が和暦で表示される', () => {
    const view = derivePersonCardView(baseInput(), baseSettings({ calendarMode: 'wareki' }))
    expect(view.years).toBe('平成2年4月1日')
  })

  it('西暦表示モードでは生年月日が西暦のまま表示される', () => {
    const view = derivePersonCardView(baseInput(), baseSettings({ calendarMode: 'gregorian' }))
    expect(view.years).toBe('1990-04-01')
  })
})

describe('personCardInnerHtml: PersonCardViewからのHTML組み立て', () => {
  it('同じPersonCardViewから生成したHTMLは何度呼んでも一致する(両方の描画系で一致することの前提)', () => {
    const view = derivePersonCardView(baseInput(), baseSettings({ visibleCardFields: fields({ furigana: true, birthPlace: true }) }))
    const htmlA = personCardInnerHtml(view, { selected: true })
    const htmlB = personCardInnerHtml(view, { selected: true })
    expect(htmlA).toBe(htmlB)
  })

  it('選択状態・故人状態のクラスが付く', () => {
    const view = derivePersonCardView(baseInput({ deceased: true }), baseSettings())
    const html = personCardInnerHtml(view, { selected: true })
    expect(html).toContain('class="tree-card selected deceased"')
    expect(html).toContain('tree-card-deceased-mark')
  })

  it('選択されていない・生存中は余分なクラスが付かない', () => {
    const view = derivePersonCardView(baseInput(), baseSettings())
    const html = personCardInnerHtml(view)
    expect(html).toContain('class="tree-card">')
    expect(html).not.toContain('tree-card-deceased-mark')
  })

  it('姓名がともに入力されている場合は姓・名それぞれの列で描かれる', () => {
    const view = derivePersonCardView(baseInput(), baseSettings())
    const html = personCardInnerHtml(view)
    expect(html).toContain('<div class="tree-card-surname">山田</div><div class="tree-card-given">太郎</div>')
  })

  it('姓のみの場合はtree-card-given列に描かれる(既存カードの見た目の踏襲)', () => {
    const view = derivePersonCardView(baseInput(), baseSettings({ visibleCardFields: fields({ given: false }) }))
    const html = personCardInnerHtml(view)
    expect(html).toContain('<div class="tree-card-given">山田</div>')
    expect(html).not.toContain('tree-card-surname')
  })

  it('氏名はHTMLエスケープされる(利用者入力対策)', () => {
    const view = derivePersonCardView(baseInput({ given: '<script>alert(1)</script>' }), baseSettings())
    const html = personCardInnerHtml(view)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('非表示人数バッジはhiddenBadgeを渡したときだけ描かれる(design.md D4)', () => {
    const view = derivePersonCardView(baseInput(), baseSettings())
    const withoutBadge = personCardInnerHtml(view)
    const withBadge = personCardInnerHtml(view, { hiddenBadge: { count: 3, revealId: 'p2' } })
    expect(withoutBadge).not.toContain('tree-card-hidden-badge')
    expect(withBadge).toContain('tree-card-hidden-badge')
    expect(withBadge).toContain('data-reveal-id="p2"')
    expect(withBadge).toContain('+3')
  })

  it('姓名それぞれ2文字以下では列にフォントサイズの指定が付かない(既定表示のまま)', () => {
    const view = derivePersonCardView(baseInput({ surname: '山田', given: '太郎' }), baseSettings())
    const html = personCardInnerHtml(view)
    expect(html).toContain('<div class="tree-card-surname">山田</div>')
    expect(html).toContain('<div class="tree-card-given">太郎</div>')
  })

  it('3文字以上の列は折り返さず、フォントサイズを縮小して1列のまま収める', () => {
    const view = derivePersonCardView(baseInput({ surname: '富岡', given: '愛梨奈' }), baseSettings())
    const html = personCardInnerHtml(view)
    expect(html).toMatch(/<div class="tree-card-given" style="font-size: 0\.\d+em">愛梨奈<\/div>/)
    // 折り返しを許す複数列(tree-card-given が2回現れる等)は生成されない
    expect(html.match(/tree-card-given/g)).toHaveLength(1)
  })

  it('列の縮小率には下限があり、極端に長い氏名でも文字が潰れきらない', () => {
    const view = derivePersonCardView(baseInput({ surname: '富岡', given: '愛梨奈美智子' }), baseSettings())
    const html = personCardInnerHtml(view)
    const match = html.match(/tree-card-given" style="font-size: (0\.\d+)em"/)
    expect(match).not.toBeNull()
    expect(Number(match?.[1])).toBeGreaterThanOrEqual(0.6)
  })

  it('性別アイコンのクラス・タイトルが性別ごとに切り替わる', () => {
    const male = personCardInnerHtml(derivePersonCardView(baseInput({ gender: 'M' }), baseSettings()))
    const female = personCardInnerHtml(derivePersonCardView(baseInput({ gender: 'F' }), baseSettings()))
    const unknown = personCardInnerHtml(derivePersonCardView(baseInput({ gender: 'U' }), baseSettings()))
    expect(male).toContain('tree-card-gender-male')
    expect(female).toContain('tree-card-gender-female')
    expect(unknown).toContain('tree-card-gender-unknown')
  })
})

describe('personToCardInput: Person → PersonCardInput', () => {
  it('domainのPersonから必要な項目を過不足なく取り出す', () => {
    const input = personToCardInput({
      id: 'x1',
      name: { surname: '鈴木', given: '花子', surnameKana: 'すずき', givenKana: 'はなこ' },
      gender: 'female',
      birth: { type: 'birth', date: { original: '1950-01-01', qualifier: 'exact', date: { year: 1950, month: 1, day: 1 } }, place: '京都府' },
      death: { type: 'death', date: { original: '2020-01-01', qualifier: 'exact', date: { year: 2020, month: 1, day: 1 } }, place: '奈良県' },
    })
    expect(input.personId).toBe('x1')
    expect(input.gender).toBe('F')
    expect(input.surname).toBe('鈴木')
    expect(input.given).toBe('花子')
    expect(input.surnameKana).toBe('すずき')
    expect(input.givenKana).toBe('はなこ')
    expect(input.birthDate).toEqual({ year: 1950, month: 1, day: 1 })
    expect(input.deathDate).toEqual({ year: 2020, month: 1, day: 1 })
    expect(input.birthPlace).toBe('京都府')
    expect(input.deathPlace).toBe('奈良県')
    expect(input.deathYear).toBe(2020)
    expect(input.deceased).toBe(true)
  })

  it('没の記録が無い場合はdeceasedがfalseになる', () => {
    const input = personToCardInput({ id: 'x2', name: { given: 'X' }, gender: 'unknown' })
    expect(input.deceased).toBe(false)
    expect(input.deathYear).toBeUndefined()
  })
})

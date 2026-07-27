import { computeAge } from '../domain/age'
import type { CalendarDate, Person, PersonId } from '../domain/types'
import { formatDateForDisplay } from '../settings/display-settings'
import type { CalendarMode, CardFieldVisibility, DateGranularity } from '../settings/display-settings'

/**
 * 人物カードの「導出」と「HTML組み立て」の共有点(design.md D3, tasks.md 6群)。
 *
 * 折りたたみ表示(family-chart, FamilyTreeCanvas)とつながった全体表示(PedigreeCanvas)は
 * 描画の仕組みが全く異なる(前者はfamily-chartのDOM操作API、後者はReactのSVG)が、
 * 「表示設定を見てカードに何を描くか決める」ロジックと「決まった内容からHTML文字列を組み立てる」
 * ロジックはどちらのモードでも同一であるべき(spec「人物カードの表現の一致」)。
 * この2つを純粋関数として本ファイルへ集約し、両方の描画系から呼ぶことで、
 * 表示設定の反映漏れが片方のモードにだけ生じる事態を防ぐ。
 */

/**
 * `PersonCardView`を導出するための入力。`FamilyChartDatum['data']`(to-family-chart-data.ts の
 * `FamilyChartCardData`)と構造的に互換な最小集合とする。family-chartはこの型のスーパーセットを
 * 持つ`data`をそのまま渡せるため、FamilyTreeCanvas側の変更なしに導出関数を共有できる。
 * PedigreeCanvasは`TreeDocument`の`Person`から`personToCardInput`で組み立てる
 */
export interface PersonCardInput {
  personId: PersonId
  gender: 'M' | 'F' | 'U'
  surname?: string
  given?: string
  surnameKana?: string
  givenKana?: string
  birthDate?: CalendarDate
  deathDate?: CalendarDate
  birthPlace?: string
  deathPlace?: string
  /** 現年齢(故人は没年齢)。生没年月日が年のみの場合はundefined(design.md D8) */
  age?: number
  /** 没年(年のみでも可)。没の記録があるかどうかの判定は`deceased`を使う。ageLabelの「没」表記の判定にのみ使う */
  deathYear?: number
  deceased: boolean
}

/**
 * カードに何を描くかを表示設定込みで確定させた結果(design.md D3の型定義がベース)。
 * 日付・年齢・生没地は表示設定(粒度・和暦/西暦・項目選択)を適用済みの文字列として保持し、
 * HTML組み立て側は書式判断を一切持たない(判断の重複を避ける)。
 */
export interface PersonCardView {
  personId: PersonId
  surname?: string
  given?: string
  /** ふりがな。姓・名を分けず1行の文字列として保持する(design.md D3を出発点に、既存カードの表示に合わせた判断) */
  kana?: string
  /** 生没年月日を表示設定の粒度・和暦/西暦で書式化した文字列(例: "1990-04-01 – 2020-01-01") */
  years?: string
  /** 年齢バッジの文字列(例: "(30歳)" "(没72歳)")。表示対象外・データ欠損時はundefined */
  ageLabel?: string
  /** 出生地・没地を結合した文字列 */
  places?: string
  gender: 'M' | 'F' | 'U'
  /** 性別アイコンを表示するか(表示設定の項目選択に従う) */
  showGenderIcon: boolean
  deceased: boolean
}

/** カード表示に関わる表示設定のうち、`derivePersonCardView`が必要とする部分 */
export interface CardDisplaySettings {
  birthDateGranularity: DateGranularity
  deathDateGranularity: DateGranularity
  calendarMode: CalendarMode
  visibleCardFields: CardFieldVisibility
}

/**
 * `PersonCardInput`と表示設定から、カードに何を描くかを導出する(design.md D3, tasks.md 6.1)。
 * 表示項目ごとに「表示対象かつデータが存在する」場合のみ値を持たせ、それ以外はundefinedにする
 * (項目自体を非表示にした場合と、データが元々未入力の場合を区別する必要はここでは無い。
 * HTML組み立て側は値の有無だけを見ればよい)。
 */
export function derivePersonCardView(person: PersonCardInput, settings: CardDisplaySettings): PersonCardView {
  const fields = settings.visibleCardFields

  const years = [
    fields.birthDate ? formatDateForDisplay(person.birthDate, settings.birthDateGranularity, settings.calendarMode) : undefined,
    fields.deathDate ? formatDateForDisplay(person.deathDate, settings.deathDateGranularity, settings.calendarMode) : undefined,
  ]
    .filter((y): y is string => y !== undefined)
    .join(' – ')

  const ageLabel =
    fields.age && person.age !== undefined ? `(${person.deathYear !== undefined ? '没' : ''}${person.age}歳)` : undefined

  // 姓・名は表示対象かつデータが存在する方だけを対象にする(データはあるのに未入力と
  // 誤解させないため、未入力時のフォールバック文言は出さない。design.md D8)
  const surname = fields.surname ? person.surname : undefined
  const given = fields.given ? person.given : undefined

  const kana = fields.furigana ? [person.surnameKana, person.givenKana].filter(Boolean).join(' ') : ''

  const places = [fields.birthPlace ? person.birthPlace : undefined, fields.deathPlace ? person.deathPlace : undefined]
    .filter((p): p is string => !!p)
    .join(' / ')

  return {
    personId: person.personId,
    surname,
    given,
    kana: kana || undefined,
    years: years || undefined,
    ageLabel,
    places: places || undefined,
    gender: person.gender,
    showGenderIcon: fields.genderIcon,
    deceased: person.deceased,
  }
}

/**
 * `TreeDocument`の`Person`から`PersonCardInput`を組み立てる(PedigreeCanvas用)。
 * to-family-chart-data.tsの`buildPersonDatums`と同等の変換だが、あちらは`rels`(親子・配偶者関係)の
 * 構築まで担う大きな関数のため流用せず、カード表示に必要な項目だけをここで独立に組み立てる
 * (buildPersonDatumsを呼び出し元ごと共有すると、family-chart固有の関係解決ロジックまで
 * PedigreeCanvasに引き込むことになり、design.md D1の「描画データはTreeDocumentからの一方向の
 * 射影」という原則には反しないが、依存の見通しが悪くなるため)
 */
export function personToCardInput(person: Person): PersonCardInput {
  return {
    personId: person.id,
    gender: person.gender === 'male' ? 'M' : person.gender === 'female' ? 'F' : 'U',
    surname: person.name.surname,
    given: person.name.given,
    surnameKana: person.name.surnameKana,
    givenKana: person.name.givenKana,
    birthDate: person.birth?.date?.date,
    deathDate: person.death?.date?.date,
    birthPlace: person.birth?.place,
    deathPlace: person.death?.place,
    age: computeAge(person),
    deathYear: person.death?.date?.date?.year,
    deceased: person.death !== undefined,
  }
}

/** 氏名は利用者入力のため、innerHTMLへ渡す前に必ずエスケープする */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/** 折りたたみ表示のみが持つ「非表示人数バッジ」(design.md D4)。PersonCardViewの一部にはしない(下記コメント参照) */
export interface HiddenBadgeView {
  count: number
  revealId: PersonId
}

export interface PersonCardHtmlOptions {
  /** 選択状態(朱の強調)。カードの見た目だが、選択中かどうかはカードの導出結果に含めない
   * (同じ人物のPersonCardViewは選択の有無で変わらないため、選択状態は描画のたびに別途渡す) */
  selected?: boolean
  /**
   * 非表示人数バッジ(design.md D4)。`PersonCardView`のフィールドにしなかったのは、
   * この概念が折りたたみ表示(family-chartの`main_id`から辿れる範囲)にしか存在せず、
   * つながった全体表示(PedigreeCanvas)は全員を描画するため常に不要になるため
   * (design.md D4: 「非表示人数バッジは表示されない」)。表示設定によって内容が変わる
   * カード本体の情報とは性質が異なり、「どちらの描画系から呼ばれたか」だけで決まる
   * 付加情報のため、HTML組み立て関数の引数として渡す形にした
   */
  hiddenBadge?: HiddenBadgeView
}

/**
 * `PersonCardView`からカード内側のHTML文字列を組み立てる(design.md D3, tasks.md 6.2)。
 * 折りたたみ表示(family-chartのsetCardInnerHtmlCreator)・つながった全体表示
 * (PedigreeCanvasのforeignObject)の両方から呼ばれる。DOM構造・クラス名は既存のカードと
 * 完全に一致させる(6.3の完了条件)。氏名等の利用者入力はすべて`escapeHtml`を経由済みのため、
 * 呼び出し側は追加のエスケープなしに`dangerouslySetInnerHTML`等へそのまま渡してよい
 */
export function personCardInnerHtml(view: PersonCardView, options: PersonCardHtmlOptions = {}): string {
  const selectedClass = options.selected ? ' selected' : ''
  const deceasedClass = view.deceased ? ' deceased' : ''

  // 故人は伝統的な系譜記法にならい「†」を付す。名前の縦書き列の中に文字として埋め込むと、
  // ふりがな・生没地等の追加項目で列の縦方向スペースが狭まった際に、†が意図しない別列へ
  // 折り返されて名前の前に浮いて見える不具合が起きるため、名前列とは独立した固定位置バッジとして描く
  const deceasedMarkHtml = view.deceased ? '<div class="tree-card-deceased-mark" title="故人">†</div>' : ''

  // 姓・名は別の縦書き列として描く(位牌・表札に倣う伝統的な書式。design.md D6)。
  // 片方しかない場合も「tree-card-given」列として描く(既存カードの見た目を保つための踏襲)
  const nameHtml =
    view.surname && view.given
      ? `<div class="tree-card-surname">${escapeHtml(view.surname)}</div><div class="tree-card-given">${escapeHtml(view.given)}</div>`
      : view.surname
        ? `<div class="tree-card-given">${escapeHtml(view.surname)}</div>`
        : view.given
          ? `<div class="tree-card-given">${escapeHtml(view.given)}</div>`
          : ''

  const kanaHtml = view.kana ? `<div class="tree-card-kana">${escapeHtml(view.kana)}</div>` : ''
  const placesHtml = view.places ? `<div class="tree-card-places">${escapeHtml(view.places)}</div>` : ''

  const badgeHtml =
    options.hiddenBadge !== undefined
      ? `<div class="tree-card-hidden-badge" data-reveal-id="${escapeHtml(options.hiddenBadge.revealId)}" title="非表示の人物が${options.hiddenBadge.count}人います。クリックすると表示します">+${options.hiddenBadge.count}</div>`
      : ''

  // 性別を色のみに依存せず形状(四角/丸/破線ひし形)でも判別できるようにする(design.md D7)
  const genderClass =
    view.gender === 'M' ? 'tree-card-gender-male' : view.gender === 'F' ? 'tree-card-gender-female' : 'tree-card-gender-unknown'
  const genderTitle = view.gender === 'M' ? '男' : view.gender === 'F' ? '女' : '性別不明'
  const genderHtml = view.showGenderIcon ? `<div class="tree-card-gender ${genderClass}" title="${genderTitle}"></div>` : ''

  return `<div class="tree-card${selectedClass}${deceasedClass}">
        ${genderHtml}
        ${deceasedMarkHtml}
        ${badgeHtml}
        ${kanaHtml}
        <div class="tree-card-name-row">${nameHtml}</div>
        ${view.years ? `<div class="tree-card-years">${escapeHtml(view.years)}${view.ageLabel ? ` ${escapeHtml(view.ageLabel)}` : ''}</div>` : ''}
        ${placesHtml}
      </div>`
}

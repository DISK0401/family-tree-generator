import { computeAge } from '../../domain/age'
import type { CalendarDate, Person, PersonId } from '../../domain/types'
import { formatDateForDisplay } from '../../store/display-settings'
import type {
  CalendarMode,
  CardFieldVisibility,
  DateGranularity,
} from '../../store/display-settings'

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
  /**
   * 出生順位ラベル(長男/次男/長女/次女等)。`Person`には保存されておらず、呼び出し側
   * (to-family-chart-data.ts / PedigreeCanvas.tsx)が兄弟のbirthOrder・genderから
   * 都度導出して渡す(design.md D2/D7)
   */
  birthOrderLabel?: string
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
  /**
   * ふりがな。姓・名を分けず1行の文字列として保持する(design.md D3を出発点に、既存カードの表示に合わせた判断)。
   * `undefined`(ふりがな表示設定そのものがオフ)と`''`(表示設定はオンだがこの人物には未入力)を区別する。
   * `personCardInnerHtml`はこの違いを見て、後者でも高さ0の行を描く(次のコメント参照)
   */
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
  /** 出生順位ラベル(長男/次男等)。未導出(出生順未設定・性別不明等)の場合はundefined */
  birthOrderLabel?: string
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
export function derivePersonCardView(
  person: PersonCardInput,
  settings: CardDisplaySettings,
): PersonCardView {
  const fields = settings.visibleCardFields

  const years = [
    fields.birthDate
      ? formatDateForDisplay(
          person.birthDate,
          settings.birthDateGranularity,
          settings.calendarMode,
        )
      : undefined,
    fields.deathDate
      ? formatDateForDisplay(
          person.deathDate,
          settings.deathDateGranularity,
          settings.calendarMode,
        )
      : undefined,
  ]
    .filter((y): y is string => y !== undefined)
    .join(' – ')

  const ageLabel =
    fields.age && person.age !== undefined
      ? `(${person.deathYear !== undefined ? '没' : ''}${person.age}歳)`
      : undefined

  // 姓・名は表示対象かつデータが存在する方だけを対象にする(データはあるのに未入力と
  // 誤解させないため、未入力時のフォールバック文言は出さない。design.md D8)
  const surname = fields.surname ? person.surname : undefined
  const given = fields.given ? person.given : undefined

  // ふりがな未入力の人物を`undefined`にすると、ふりがな行そのものが描かれなくなり、
  // 同じ図の中でふりがなが入力済みの人物とで氏名の縦書き列が始まる高さがずれて見える
  // (`kana`はカードの縦積みの中で氏名列より上に来るため、行が消えると氏名列が上へ詰まる)。
  // 表示設定がオンの間は必ず`''`(空文字。undefinedにしない)を返し、行の高さを確保させる
  const kana = fields.furigana
    ? [person.surnameKana, person.givenKana].filter(Boolean).join(' ')
    : undefined

  const places = [
    fields.birthPlace ? person.birthPlace : undefined,
    fields.deathPlace ? person.deathPlace : undefined,
  ]
    .filter((p): p is string => !!p)
    .join(' / ')

  return {
    personId: person.personId,
    surname,
    given,
    kana,
    years: years || undefined,
    ageLabel,
    places: places || undefined,
    gender: person.gender,
    showGenderIcon: fields.genderIcon,
    deceased: person.deceased,
    birthOrderLabel: person.birthOrderLabel,
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
export function personToCardInput(
  person: Person,
  birthOrderLabel?: string,
): PersonCardInput {
  return {
    personId: person.id,
    gender:
      person.gender === 'male' ? 'M' : person.gender === 'female' ? 'F' : 'U',
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
    birthOrderLabel,
  }
}

/**
 * 縦書き氏名の列は折り返しを禁止している(FamilyTreeCanvas.css `white-space: nowrap`, design.md D1)ため、
 * 文字数がカードの固定高さに対して多い場合はフォントサイズを縮小して収める(design.md D2)。
 * 2〜3文字は等倍のまま、それを超える分は文字数に反比例して縮小し、可読性を保つ下限を設ける。
 * 姓・名は独立した列のため、縮小率も列ごとに個別の文字数で決める
 */
function nameFontScale(charCount: number): number {
  // 戸籍由来の家系図という用途上、「仁三郎」「武之助」のような伝統的な3文字名も
  // 無縮小で表示できるようにする(design.md D3)
  const COMFORTABLE_CHARS = 3
  const MIN_SCALE = 0.6
  if (charCount <= COMFORTABLE_CHARS) return 1
  return Math.max(COMFORTABLE_CHARS / charCount, MIN_SCALE)
}

/**
 * ふりがな行(`.tree-card-kana`)も氏名列と同じ理由で折り返しを禁止している
 * (CSS側の`white-space: nowrap`)ため、姓かな・名かなを結合した文字数が多い場合は
 * フォントサイズを縮小して1行に収める(design.md D2, fix-tree-card-overlap-and-density)。
 * 「しぶさわ たけのすけ」(9文字)程度の戸籍由来の長さは無縮小で収まる値を基準にする
 */
function kanaFontScale(charCount: number): number {
  const COMFORTABLE_CHARS = 10
  const MIN_SCALE = 0.6
  if (charCount <= COMFORTABLE_CHARS) return 1
  return Math.max(COMFORTABLE_CHARS / charCount, MIN_SCALE)
}

/**
 * `.tree-card-kana`(person-card.css)のCSS側の基準フォントサイズと一致させる。
 * 氏名列(`nameColumnHtml`)は縮小率を`em`のインラインスタイルで表現しているが、
 * `font-size`に付けた`em`は常に**親要素**の実フォントサイズを基準に解決されるため、
 * 「クラスの元々のfont-size(1rem)」と「祖先から継承されたfont-size(既定16px)」が
 * たまたま一致している(design tokenの`--text-md`=1rem)場合にしか正しく縮小されない。
 * ふりがなの基準サイズ(0.5625rem)は祖先のfont-sizeと一致しないため、同じ手法は使えない。
 * `rem`はルート要素基準で祖先のfont-sizeに依存しないため、絶対値として計算する
 */
const KANA_BASE_FONT_SIZE_REM = 0.5625

/** 氏名は利用者入力のため、innerHTMLへ渡す前に必ずエスケープする */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/**
 * タグ1要素分のHTML文字列を組み立てる小さなヘルパ(監査 中11: 構造的防御)。
 * 属性値・テキストは呼び出し側の判断を待たず**必ず**エスケープする。
 * `personCardInnerHtml`配下で利用者入力(氏名・地名・日付原文等)を描く箇所は
 * すべてこの関数を経由させることで、「新しいフィールドを足すときに個別の
 * escapeHtml呼び出しを忘れる」形のXSS混入を構造的に防ぐ。
 * 子要素を持つコンテナはこの関数の対象外(エスケープ済み断片の結合は呼び出し側で行う)。
 */
function htmlTag(
  tag: string,
  attrs: Record<string, string>,
  text = '',
): string {
  const attrHtml = Object.entries(attrs)
    .map(([name, value]) => ` ${name}="${escapeHtml(value)}"`)
    .join('')
  return `<${tag}${attrHtml}>${escapeHtml(text)}</${tag}>`
}

/** 氏名の1列分のHTML(縮小が必要な場合のみインラインスタイルを付す。htmlTag経由でエスケープする) */
function nameColumnHtml(
  className: 'tree-card-surname' | 'tree-card-given',
  text: string,
): string {
  const scale = nameFontScale(text.length)
  const attrs: Record<string, string> = { class: className }
  if (scale < 1) attrs.style = `font-size: ${scale.toFixed(2)}em`
  return htmlTag('div', attrs, text)
}

/** ふりがな行のHTML(縮小が必要な場合のみインラインスタイルを付す。htmlTag経由でエスケープする) */
function kanaRowHtml(kana: string): string {
  const scale = kanaFontScale(kana.length)
  const attrs: Record<string, string> = { class: 'tree-card-kana' }
  if (scale < 1) {
    attrs.style = `font-size: ${(KANA_BASE_FONT_SIZE_REM * scale).toFixed(4)}rem`
  }
  return htmlTag('div', attrs, kana)
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
export function personCardInnerHtml(
  view: PersonCardView,
  options: PersonCardHtmlOptions = {},
): string {
  const selectedClass = options.selected ? ' selected' : ''
  const deceasedClass = view.deceased ? ' deceased' : ''

  // 利用者入力を含む葉要素はすべてhtmlTag経由で組み立てる(監査 中11: エスケープの構造的防御)。
  // クラス名等の内部定数も同じ経路を通るが、エスケープ対象文字を含まないため出力は変わらない

  // 故人は伝統的な系譜記法にならい「†」を付す。名前の縦書き列の中に文字として埋め込むと、
  // ふりがな・生没地等の追加項目で列の縦方向スペースが狭まった際に、†が意図しない別列へ
  // 折り返されて名前の前に浮いて見える不具合が起きるため、名前列とは独立した固定位置バッジとして描く
  const deceasedMarkHtml = view.deceased
    ? htmlTag('div', { class: 'tree-card-deceased-mark', title: '故人' }, '†')
    : ''

  // 出生順位ラベル(長男/次男等)は性別インジケーター・故人マーカーの並びに続けて配置する
  // (design.md D2/D7, spec tree-rendering「出生順位ラベルの表示」)
  const birthOrderLabelHtml = view.birthOrderLabel
    ? htmlTag('div', { class: 'tree-card-birth-order' }, view.birthOrderLabel)
    : ''

  // 姓・名は別の縦書き列として描く(位牌・表札に倣う伝統的な書式。design.md D6)。
  // 片方しかない場合も「tree-card-given」列として描く(既存カードの見た目を保つための踏襲)
  const nameHtml =
    view.surname && view.given
      ? `${nameColumnHtml('tree-card-surname', view.surname)}${nameColumnHtml('tree-card-given', view.given)}`
      : view.surname
        ? nameColumnHtml('tree-card-given', view.surname)
        : view.given
          ? nameColumnHtml('tree-card-given', view.given)
          : ''

  // `view.kana`が`''`(表示設定はオンだがこの人物には未入力)の場合も行を描く。
  // 空のdivでも行の高さ(line-height由来)は確保されるため、ふりがな入力済みの人物と
  // 未入力の人物とで、下に続く氏名列の開始位置が上下にずれることを防げる
  const kanaHtml = view.kana !== undefined ? kanaRowHtml(view.kana) : ''
  const placesHtml = view.places
    ? htmlTag('div', { class: 'tree-card-places' }, view.places)
    : ''

  const badgeHtml =
    options.hiddenBadge !== undefined
      ? htmlTag(
          'div',
          {
            class: 'tree-card-hidden-badge',
            'data-reveal-id': options.hiddenBadge.revealId,
            title: `非表示の人物が${options.hiddenBadge.count}人います。クリックすると表示します`,
          },
          `+${options.hiddenBadge.count}`,
        )
      : ''

  // 性別を色のみに依存せず形状(四角/丸/破線ひし形)でも判別できるようにする(design.md D7)
  const genderClass =
    view.gender === 'M'
      ? 'tree-card-gender-male'
      : view.gender === 'F'
        ? 'tree-card-gender-female'
        : 'tree-card-gender-unknown'
  const genderTitle =
    view.gender === 'M' ? '男' : view.gender === 'F' ? '女' : '性別不明'
  const genderHtml = view.showGenderIcon
    ? htmlTag('div', {
        class: `tree-card-gender ${genderClass}`,
        title: genderTitle,
      })
    : ''

  const yearsText = view.years
    ? `${view.years}${view.ageLabel ? ` ${view.ageLabel}` : ''}`
    : undefined
  const yearsHtml = yearsText
    ? htmlTag('div', { class: 'tree-card-years' }, yearsText)
    : ''

  // ルートのdivだけは(エスケープ済みの)子断片を含むためhtmlTagを通さない。
  // クラス名はすべて内部定数であり、利用者入力はここへは流れない
  return `<div class="tree-card surface--raised${selectedClass}${deceasedClass}">
        ${genderHtml}
        ${deceasedMarkHtml}
        ${birthOrderLabelHtml}
        ${badgeHtml}
        ${kanaHtml}
        <div class="tree-card-name-row">${nameHtml}</div>
        ${yearsHtml}
        ${placesHtml}
      </div>`
}

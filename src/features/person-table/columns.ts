import { parseGenderInput, formatGender } from '../../domain/gender'
import { displayName } from '../../domain/helpers'
import { parseDateInput } from '../../domain/parse-date'
import type {
  LifeEvent,
  Person,
  PersonEventType,
  PersonId,
  TreeDocument,
} from '../../domain/types'
import { formatDateForDisplay } from '../../settings/display-settings'
import type {
  CalendarMode,
  DateGranularity,
} from '../../settings/display-settings'

/**
 * 表形式ビューの列定義(design.md D2)。
 *
 * 「id・見出し・Personからの表示文字列の導出・セル文字列からパッチへの解釈」を
 * 1箇所に宣言的に持ち、テーブル実装(描画・選択・クリップボード)から独立させる。
 * レンダリング層に依存しない純関数の集まりであり、プランB(Tabulator移行)でも
 * この解釈層とテストをそのまま再利用できる(design.md D2 プランB条項)。
 */

/** updatePerson / bulkUpsertPersons が受け取るパッチ */
export type PersonPatch = Partial<Omit<Person, 'id'>>

/** セル文字列の解釈結果。エラーは利用者向けの文言を持つ(セル単位のエラー表示に使う) */
export type CellParseResult =
  { ok: true; patch: PersonPatch } | { ok: false; message: string }

/** 表示文字列の導出に必要な文脈(表示設定と、配偶者列のための逆引き) */
export interface ColumnContext {
  birthDateGranularity: DateGranularity
  deathDateGranularity: DateGranularity
  calendarMode: CalendarMode
  /** personId → 配偶者のdisplayName一覧(buildSpouseNamesで構築する) */
  spouseNamesOf: (personId: PersonId) => string[]
}

export interface TableColumn {
  id: string
  label: string
  /** 編集モードでセル編集・ペースト適用の対象になるか(配偶者列のみ false) */
  editable: boolean
  /** 列見出しからの並べ替えを提供するか */
  sortable: boolean
  /** 閲覧セルとコピーに使う表示文字列(spec「矩形選択とコピー」: 見たままコピー) */
  getValue: (person: Person, ctx: ColumnContext) => string
  /**
   * 編集開始時にエディタへ入れる初期値。日付列は表示書式ではなく入力原文
   * (original)を使い、利用者の表記を失わずに編集を続けられるようにする。
   * 省略時は getValue と同じ
   */
  getEditValue?: (person: Person) => string
  /** セル文字列をパッチへ解釈する(editable な列のみ) */
  parse?: (raw: string, person: Person) => CellParseResult
}

/** 空文字は「未入力へ戻す」を意味する。前後空白は表計算からの貼り付けに多いため無視する */
function normalizeText(raw: string): string | undefined {
  const trimmed = raw.trim()
  return trimmed === '' ? undefined : trimmed
}

function nameField(
  id: string,
  label: string,
  field: 'surname' | 'given' | 'surnameKana' | 'givenKana',
): TableColumn {
  return {
    id,
    label,
    editable: true,
    sortable: field === 'surname' || field === 'given',
    getValue: (person) => person.name[field] ?? '',
    parse: (raw, person) => ({
      ok: true,
      patch: { name: { ...person.name, [field]: normalizeText(raw) } },
    }),
  }
}

function eventOf(person: Person, eventType: PersonEventType) {
  return eventType === 'birth' ? person.birth : person.death
}

/**
 * 生没イベントを対応するフィールドへ入れるパッチを作る。
 * `event.type` は常に `eventType` で構築されるため、ユニオンからの絞り込みだけを
 * キャストで補う(値の整合はこのモジュール内で閉じている)
 */
function eventPatch(
  eventType: PersonEventType,
  event: LifeEvent<PersonEventType> | undefined,
): PersonPatch {
  return eventType === 'birth'
    ? { birth: event as LifeEvent<'birth'> | undefined }
    : { death: event as LifeEvent<'death'> | undefined }
}

/** 生没イベントの日付セル。構造化日付は表示設定準拠で表示し、無ければ原文で代替する */
function dateField(
  id: string,
  label: string,
  eventType: PersonEventType,
  granularityOf: (ctx: ColumnContext) => DateGranularity,
): TableColumn {
  return {
    id,
    label,
    editable: true,
    sortable: true,
    getValue: (person, ctx) => {
      const date = eventOf(person, eventType)?.date
      return (
        formatDateForDisplay(
          date?.date,
          granularityOf(ctx),
          ctx.calendarMode,
        ) ??
        date?.original ??
        ''
      )
    },
    // 編集は表示書式ではなく入力原文から続ける(WarekiDateInputと同じ方針)
    getEditValue: (person) => eventOf(person, eventType)?.date?.original ?? '',
    parse: (raw, person) => {
      const event = eventOf(person, eventType)
      if (raw.trim() === '') {
        // 日付を未入力へ戻す。場所だけが残る場合はイベント自体は保持する
        const next = event?.place
          ? { type: eventType, place: event.place }
          : undefined
        return { ok: true, patch: eventPatch(eventType, next) }
      }
      const parsed = parseDateInput(raw)
      if (!parsed.ok) return { ok: false, message: parsed.message }
      return {
        ok: true,
        patch: eventPatch(eventType, {
          type: eventType,
          date: parsed.value,
          ...(event?.place ? { place: event.place } : {}),
        }),
      }
    },
  }
}

/** 生没イベントの場所セル。日付は保持したまま場所だけを設定・解除する */
function placeField(
  id: string,
  label: string,
  eventType: PersonEventType,
): TableColumn {
  return {
    id,
    label,
    editable: true,
    sortable: false,
    getValue: (person) => eventOf(person, eventType)?.place ?? '',
    parse: (raw, person) => {
      const place = normalizeText(raw)
      const event = eventOf(person, eventType)
      const next =
        place === undefined
          ? event?.date
            ? { type: eventType, date: event.date }
            : undefined
          : {
              type: eventType,
              ...(event?.date ? { date: event.date } : {}),
              place,
            }
      return { ok: true, patch: eventPatch(eventType, next) }
    },
  }
}

/**
 * 表の列定義(spec「列構成」)。パネルで参照/変更できる人物属性+読み取り専用の配偶者列。
 * 並び順は入力の流れ(氏名→ふりがな→性別→生→没→メモ)に合わせる
 */
export const PERSON_TABLE_COLUMNS: readonly TableColumn[] = [
  nameField('surname', '姓', 'surname'),
  nameField('given', '名', 'given'),
  nameField('surnameKana', '姓(ふりがな)', 'surnameKana'),
  nameField('givenKana', '名(ふりがな)', 'givenKana'),
  {
    id: 'gender',
    label: '性別',
    editable: true,
    sortable: false,
    getValue: (person) => formatGender(person.gender),
    parse: (raw) => {
      const gender = parseGenderInput(raw)
      if (gender === undefined) {
        return {
          ok: false,
          message: '性別は「男」「女」「不明」(またはM/F/U)で入力してください',
        }
      }
      return { ok: true, patch: { gender } }
    },
  },
  dateField(
    'birthDate',
    '生年月日',
    'birth',
    (ctx) => ctx.birthDateGranularity,
  ),
  placeField('birthPlace', '出生地', 'birth'),
  dateField(
    'deathDate',
    '没年月日',
    'death',
    (ctx) => ctx.deathDateGranularity,
  ),
  placeField('deathPlace', '没地', 'death'),
  {
    id: 'note',
    label: 'メモ',
    editable: true,
    sortable: false,
    getValue: (person) => person.note ?? '',
    parse: (raw) => {
      // メモは複数行を許すため、空判定以外の整形(trim)はしない
      return { ok: true, patch: { note: raw === '' ? undefined : raw } }
    },
  },
  {
    id: 'spouses',
    label: '配偶者',
    editable: false,
    sortable: false,
    getValue: (person, ctx) => ctx.spouseNamesOf(person.id).join('、'),
  },
]

/**
 * 配偶者列のための逆引き(personId → 配偶者のdisplayName一覧)を1回で構築する。
 * 家族の配偶者リストから自分以外を集める(spec「列構成」の閲覧用要約)
 */
export function buildSpouseNames(doc: TreeDocument): Map<PersonId, string[]> {
  const result = new Map<PersonId, string[]>()
  for (const family of Object.values(doc.families)) {
    for (const personId of family.spouseIds) {
      for (const otherId of family.spouseIds) {
        if (otherId === personId) continue
        const other = doc.persons[otherId]
        if (!other) continue
        const names = result.get(personId) ?? []
        names.push(displayName(other))
        result.set(personId, names)
      }
    }
  }
  return result
}

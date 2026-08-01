import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import {
  bulkUpsertPersons,
  type PersonBulkUpdate,
  type PersonInit,
} from '../domain/commands'
import { compareFuzzyDate } from '../domain/helpers'
import type { Person, PersonId } from '../domain/types'
import {
  buildSpouseNames,
  PERSON_TABLE_COLUMNS,
  type ColumnContext,
  type TableColumn,
} from '../features/person-table/columns'
import { parseTsv, serializeTsv } from '../features/person-table/tsv'
import { useDisplaySettingsStore } from '../settings/display-settings-store'
import { useTreeStore } from '../store/tree-store'
import './PersonTableView.css'

export interface PersonTableViewProps {
  selectedPersonId: string | null
  onSelectPerson: (personId: string | null) => void
}

/** セル位置。行は表示順のインデックス、列は PERSON_TABLE_COLUMNS のインデックス */
interface CellPos {
  row: number
  col: number
}

type SortDirection = 'asc' | 'desc'
interface SortSpec {
  columnId: string
  direction: SortDirection
}

/** ペースト・確定で取り込めなかったセルの記録(spec「ペースト」: 行×列と理由の明示) */
interface CellError {
  /** 表示上の行番号(1始まり)。サマリ文言に使う */
  rowNumber: number
  columnLabel: string
  message: string
  /** エラーマーカーの位置決め用キー(既存人物は personId、追加行は行番号ベース) */
  markerKey: string
}

function cellMarkerKey(
  personId: PersonId | undefined,
  rowIndex: number,
  columnId: string,
): string {
  return `${personId ?? `ghost-${rowIndex}`}:${columnId}`
}

/** 横断検索: 氏名・ふりがなの部分一致(PersonPickerと同じ考え方) */
function matchesFilter(person: Person, query: string): boolean {
  if (!query) return true
  const name = [person.name.surname, person.name.given]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  const kana = [person.name.surnameKana, person.name.givenKana]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  const q = query.toLowerCase()
  return name.includes(q) || kana.includes(q)
}

/** 列ごとの絞り込み値(列id → 入力値)。空文字は「その列は絞り込まない」 */
type ColumnFilters = Record<string, string>

/**
 * 列ごとの絞り込み(spec「列ごとの絞り込みと横断検索」)。
 * すべての条件を満たす行のみを残す(AND)。テキストは表示値の部分一致、
 * 選択式(性別)は表示値の完全一致
 */
function matchesColumnFilters(
  person: Person,
  columns: readonly TableColumn[],
  filters: ColumnFilters,
  ctx: ColumnContext,
): boolean {
  for (const column of columns) {
    const raw = filters[column.id]?.trim()
    if (!raw) continue
    // 列固有の判定があれば優先する(日付列は書式に依らない値の照合。design.md D8)
    if (column.filterMatch) {
      if (!column.filterMatch(person, ctx, raw)) return false
      continue
    }
    const value = column.getValue(person, ctx)
    if (column.filterKind === 'select') {
      if (value !== raw) return false
    } else if (!value.toLowerCase().includes(raw.toLowerCase())) {
      return false
    }
  }
  return true
}

/**
 * 列ごとの比較(design.md D8)。日付列は構造化日付として比較し、それ以外は
 * 表示文字列の日本語順。未入力は昇順・降順のいずれでも末尾に固定する
 * (空行が先頭を占めると一覧の意味が薄れるため)
 */
function comparePersons(
  a: Person,
  b: Person,
  column: TableColumn,
  ctx: ColumnContext,
  direction: SortDirection,
): number {
  const sign = direction === 'asc' ? 1 : -1
  if (column.dateEventType) {
    const dateOf = (p: Person) =>
      column.dateEventType === 'birth' ? p.birth?.date : p.death?.date
    const da = dateOf(a)
    const db = dateOf(b)
    if (!da?.date && !db?.date) return 0
    if (!da?.date) return 1
    if (!db?.date) return -1
    return compareFuzzyDate(da, db) * sign
  }
  const va = column.getValue(a, ctx)
  const vb = column.getValue(b, ctx)
  if (va === '' && vb === '') return 0
  if (va === '') return 1
  if (vb === '') return -1
  return va.localeCompare(vb, 'ja') * sign
}

/**
 * 人物一覧の表形式ビュー(spec person-table-editor、design.md D1〜D7)。
 *
 * 閲覧モード(既定)では一覧・並べ替え・絞り込み・行選択のみを提供し、
 * 編集モードでセル編集・矩形選択・TSVコピー&ペースト・行追加(=人物追加)を有効にする。
 * 編集はすべて `bulkUpsertPersons` を経由し(1操作=undo 1件・no-opは履歴に積まれない)、
 * 表専用のデータ経路を持たない(design.md D3)。
 */
export function PersonTableView({
  selectedPersonId,
  onSelectPerson,
}: PersonTableViewProps) {
  const doc = useTreeStore((s) => s.document)
  const apply = useTreeStore((s) => s.apply)
  const birthDateGranularity = useDisplaySettingsStore(
    (s) => s.birthDateGranularity,
  )
  const deathDateGranularity = useDisplaySettingsStore(
    (s) => s.deathDateGranularity,
  )
  const calendarMode = useDisplaySettingsStore((s) => s.calendarMode)

  const [mode, setMode] = useState<'browse' | 'edit'>('browse')
  /** 横断検索(氏名・ふりがな)。列ごとの絞り込みとはANDで合成する */
  const [filter, setFilter] = useState('')
  /** 列ごとの絞り込み(列見出し直下の行。design.md D8) */
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({})
  const [sort, setSort] = useState<SortSpec | null>(null)
  /** 編集モードのセルフォーカス(rovingフォーカスの現在地) */
  const [focus, setFocus] = useState<CellPos | null>(null)
  /** 矩形選択のアンカー(Shift操作の起点)。無ければ選択はフォーカスセルのみ */
  const [anchor, setAnchor] = useState<CellPos | null>(null)
  /** 編集中セルの下書き。nullなら編集していない */
  const [editing, setEditing] = useState<(CellPos & { draft: string }) | null>(
    null,
  )
  const [cellErrors, setCellErrors] = useState<Map<string, CellError>>(
    () => new Map(),
  )
  const [pasteSummary, setPasteSummary] = useState<string | null>(null)
  /** IME変換中はEnter/矢印をナビゲーションとして扱わない(design.md D5) */
  const composingRef = useRef(false)
  /**
   * 編集モード中の行順の固定(design.md D5: 編集・ペーストの最中に行順が動くと
   * 適用先がずれる)。編集モードへ入った時点の表示順を保持し、追加分は末尾へ足す
   */
  const editOrderRef = useRef<PersonId[]>([])
  const rootRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null)

  const spouseNames = useMemo(() => buildSpouseNames(doc), [doc])
  const ctx = useMemo<ColumnContext>(
    () => ({
      birthDateGranularity,
      deathDateGranularity,
      calendarMode,
      spouseNamesOf: (personId) => spouseNames.get(personId) ?? [],
    }),
    [birthDateGranularity, deathDateGranularity, calendarMode, spouseNames],
  )

  const columns = PERSON_TABLE_COLUMNS

  /** 表示する行(人物)の並び。閲覧=並べ替え+絞り込み、編集=固定順+絞り込み */
  const rows = useMemo<Person[]>(() => {
    const keep = (p: Person) =>
      matchesFilter(p, filter.trim()) &&
      matchesColumnFilters(p, columns, columnFilters, ctx)
    if (mode === 'edit') {
      const byId = doc.persons
      return editOrderRef.current
        .map((id) => byId[id])
        .filter((p): p is Person => p !== undefined)
        .filter(keep)
    }
    const filtered = Object.values(doc.persons).filter(keep)
    if (!sort) return filtered
    const column = columns.find((c) => c.id === sort.columnId)
    if (!column) return filtered
    return [...filtered].sort((a, b) =>
      comparePersons(a, b, column, ctx, sort.direction),
    )
  }, [doc, mode, filter, columnFilters, sort, columns, ctx])

  /** 絞り込みが1つ以上有効か(解除ボタンの表示条件。spec「列ごとの絞り込みと横断検索」) */
  const hasActiveFilter =
    filter.trim() !== '' ||
    Object.values(columnFilters).some((v) => v.trim() !== '')

  function clearAllFilters() {
    setFilter('')
    setColumnFilters({})
  }

  /** 編集モードでは末尾に「新しい人物」のゴースト行を1行足す(design.md D3) */
  const ghostRowIndex = mode === 'edit' ? rows.length : -1
  const rowCount = mode === 'edit' ? rows.length + 1 : rows.length

  const enterEditMode = useCallback(() => {
    editOrderRef.current = rows.map((p) => p.id)
    setMode('edit')
    setFocus({ row: 0, col: 0 })
    setAnchor(null)
  }, [rows])

  const exitEditMode = useCallback(() => {
    setMode('browse')
    setEditing(null)
    setFocus(null)
    setAnchor(null)
    setPasteSummary(null)
  }, [])

  /** 選択中の人物の行を視認できる位置へ(spec「選択の共有」) */
  useEffect(() => {
    if (!selectedPersonId) return
    const row = rootRef.current?.querySelector(
      `tr[data-person-id="${CSS.escape(selectedPersonId)}"]`,
    )
    row?.scrollIntoView?.({ block: 'nearest' })
    // マウント時と選択変更時のみ。行の並び替えでは追従しない(視界が跳ねるため)
  }, [selectedPersonId])

  /** 編集開始時にエディタへフォーカスを移す */
  useEffect(() => {
    editorRef.current?.focus()
    if (editorRef.current instanceof HTMLInputElement) {
      editorRef.current.select()
    }
  }, [editing?.row, editing?.col])

  function clampPos(pos: CellPos): CellPos {
    return {
      row: Math.max(0, Math.min(rowCount - 1, pos.row)),
      col: Math.max(0, Math.min(columns.length - 1, pos.col)),
    }
  }

  /** 現在の矩形選択(アンカー〜フォーカス)。無選択時はフォーカスセルのみ */
  const selection = useMemo(() => {
    if (!focus) return null
    const a = anchor ?? focus
    return {
      top: Math.min(a.row, focus.row),
      bottom: Math.max(a.row, focus.row),
      left: Math.min(a.col, focus.col),
      right: Math.max(a.col, focus.col),
    }
  }, [focus, anchor])

  function isSelected(row: number, col: number): boolean {
    if (!selection) return false
    return (
      row >= selection.top &&
      row <= selection.bottom &&
      col >= selection.left &&
      col <= selection.right
    )
  }

  /** 1操作分の更新+追加を適用する(apply 1回=undo 1件)。追加された人物IDを返す */
  const applyBulk = useCallback(
    (updates: PersonBulkUpdate[], additions: PersonInit[]): PersonId[] => {
      let added: PersonId[] = []
      apply((current) => {
        const result = bulkUpsertPersons(current, updates, additions)
        added = result.addedPersonIds
        return result.doc
      })
      editOrderRef.current = [...editOrderRef.current, ...added]
      return added
    },
    [apply],
  )

  /** セル1つの確定。ゴースト行なら人物追加、既存行なら属性更新(いずれもno-opは無視) */
  function commitCell(pos: CellPos, raw: string): boolean {
    const column = columns[pos.col]
    if (!column.editable || !column.parse) return true

    if (pos.row === ghostRowIndex) {
      // 全セル空のままでは人物を作らない(spec「行追加による人物の追加」)
      if (raw.trim() === '') return true
      const blank: Person = { id: '', name: {}, gender: 'unknown' }
      const parsed = column.parse(raw, blank)
      if (!parsed.ok) {
        recordErrors([
          {
            rowNumber: pos.row + 1,
            columnLabel: column.label,
            message: parsed.message,
            markerKey: cellMarkerKey(undefined, pos.row, column.id),
          },
        ])
        return false
      }
      const init: PersonInit = { name: {}, ...parsed.patch }
      applyBulk([], [init])
      clearError(cellMarkerKey(undefined, pos.row, column.id))
      return true
    }

    const person = rows[pos.row]
    if (!person) return true
    const parsed = column.parse(raw, person)
    if (!parsed.ok) {
      recordErrors([
        {
          rowNumber: pos.row + 1,
          columnLabel: column.label,
          message: parsed.message,
          markerKey: cellMarkerKey(person.id, pos.row, column.id),
        },
      ])
      return false
    }
    applyBulk([{ personId: person.id, patch: parsed.patch }], [])
    clearError(cellMarkerKey(person.id, pos.row, column.id))
    return true
  }

  function recordErrors(errors: CellError[]) {
    if (errors.length === 0) return
    setCellErrors((prev) => {
      const next = new Map(prev)
      for (const e of errors) next.set(e.markerKey, e)
      return next
    })
  }

  function clearError(markerKey: string) {
    setCellErrors((prev) => {
      if (!prev.has(markerKey)) return prev
      const next = new Map(prev)
      next.delete(markerKey)
      return next
    })
  }

  /** ペースト: TSVを起点セルから展開し、bulkUpsertPersons 1回で適用(design.md D3・D4) */
  function handlePaste(e: ReactClipboardEvent<HTMLDivElement>) {
    if (mode !== 'edit' || editing || !focus) return
    const text = e.clipboardData.getData('text/plain')
    if (!text) return
    e.preventDefault()

    const data = parseTsv(text)
    if (data.length === 0) return
    const start = selection
      ? { row: selection.top, col: selection.left }
      : focus

    const updates: PersonBulkUpdate[] = []
    const additions: PersonInit[] = []
    const errors: CellError[] = []

    for (let r = 0; r < data.length; r++) {
      const rowIndex = start.row + r
      const isAddition = rowIndex >= rows.length
      const basePerson: Person = isAddition
        ? { id: '', name: {}, gender: 'unknown' }
        : rows[rowIndex]

      let pending: Person = basePerson
      let rowHasValue = false
      let rowHasApplicableCell = false

      for (let c = 0; c < data[r].length; c++) {
        const colIndex = start.col + c
        const column = columns[colIndex]
        if (!column) continue // 列からはみ出た分は無視する
        const cellText = data[r][c]
        if (cellText.trim() !== '') rowHasValue = true
        if (!column.editable || !column.parse) {
          if (cellText.trim() !== '') {
            errors.push({
              rowNumber: rowIndex + 1,
              columnLabel: column.label,
              message: '読み取り専用の列です',
              markerKey: cellMarkerKey(
                isAddition ? undefined : pending.id,
                rowIndex,
                column.id,
              ),
            })
          }
          continue
        }
        const parsed = column.parse(cellText, pending)
        if (!parsed.ok) {
          errors.push({
            rowNumber: rowIndex + 1,
            columnLabel: column.label,
            message: parsed.message,
            markerKey: cellMarkerKey(
              isAddition ? undefined : pending.id,
              rowIndex,
              column.id,
            ),
          })
          continue
        }
        pending = { ...pending, ...parsed.patch }
        rowHasApplicableCell = true
      }

      if (isAddition) {
        // 有効な値がひとつも無い行からは人物を作らない
        if (!rowHasValue || !rowHasApplicableCell) continue
        const { id: _id, ...init } = pending
        void _id
        additions.push(init)
      } else {
        const { id: _id, ...patch } = pending
        void _id
        updates.push({ personId: basePerson.id, patch: patch })
      }
    }

    applyBulk(updates, additions)
    recordErrors(errors)
    setPasteSummary(
      errors.length === 0
        ? null
        : `${errors.length}件のセルを取り込めませんでした: ` +
            errors
              .slice(0, 5)
              .map((e) => `${e.rowNumber}行目の${e.columnLabel}(${e.message})`)
              .join('、') +
            (errors.length > 5 ? ` ほか${errors.length - 5}件` : '') +
            '。貼り付け全体は「元に戻す」で取り消せます',
    )
  }

  /** コピー: 選択範囲の表示文字列をTSVで書き出す(spec「矩形選択とコピー」) */
  function handleCopy(e: ReactClipboardEvent<HTMLDivElement>) {
    if (mode !== 'edit' || editing || !selection) return
    const cells: string[][] = []
    for (let r = selection.top; r <= selection.bottom; r++) {
      const row: string[] = []
      for (let c = selection.left; c <= selection.right; c++) {
        const person = rows[r]
        row.push(person ? columns[c].getValue(person, ctx) : '')
      }
      cells.push(row)
    }
    e.clipboardData.setData('text/plain', serializeTsv(cells))
    e.preventDefault()
  }

  /** 選択範囲のクリア(Delete/Backspace)。編集可能な列のみ、1回のundo単位で */
  function clearSelection() {
    if (!selection) return
    const updates: PersonBulkUpdate[] = []
    for (let r = selection.top; r <= selection.bottom; r++) {
      const person = rows[r]
      if (!person) continue
      let pending: Person = person
      for (let c = selection.left; c <= selection.right; c++) {
        const column = columns[c]
        if (!column.editable || !column.parse) continue
        const parsed = column.parse('', pending)
        if (parsed.ok) pending = { ...pending, ...parsed.patch }
      }
      const { id: _id, ...patch } = pending
      void _id
      updates.push({ personId: person.id, patch: patch })
    }
    applyBulk(updates, [])
  }

  function startEditing(pos: CellPos, initialDraft?: string) {
    const column = columns[pos.col]
    if (mode !== 'edit' || !column.editable) return
    const person = rows[pos.row]
    const current =
      pos.row === ghostRowIndex || !person
        ? ''
        : (column.getEditValue?.(person) ?? column.getValue(person, ctx))
    setEditing({ ...pos, draft: initialDraft ?? current })
  }

  /** 編集を確定し、成功したら次のセルへ移る */
  function commitEditing(move: 'down' | 'right' | 'none'): void {
    if (!editing) return
    const ok = commitCell(editing, editing.draft)
    if (!ok) {
      // エラーはセルに残す。編集状態は閉じてフォーカスは動かさない(値は変更されていない)
      setEditing(null)
      return
    }
    setEditing(null)
    if (move === 'none') return
    const next = clampPos({
      row: editing.row + (move === 'down' ? 1 : 0),
      col: editing.col + (move === 'right' ? 1 : 0),
    })
    setFocus(next)
    setAnchor(null)
  }

  /** グリッドのキーボード操作(編集モード・非編集中)。design.md D5 */
  function handleGridKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (mode !== 'edit' || editing || !focus) return
    const arrows: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    }
    if (e.key in arrows) {
      e.preventDefault()
      const [dr, dc] = arrows[e.key]
      const next = clampPos({ row: focus.row + dr, col: focus.col + dc })
      if (e.shiftKey) {
        if (!anchor) setAnchor(focus)
      } else {
        setAnchor(null)
      }
      setFocus(next)
    } else if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault()
      startEditing(focus)
    } else if (e.key === 'Tab') {
      e.preventDefault()
      setFocus(clampPos({ row: focus.row, col: focus.col + 1 }))
      setAnchor(null)
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      clearSelection()
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // 直接タイピングで置き換え編集を開始する(Excelの操作感)
      e.preventDefault()
      startEditing(focus, e.key)
    }
  }

  function handleEditorKeyDown(
    e: ReactKeyboardEvent<HTMLInputElement | HTMLSelectElement>,
  ) {
    // IME変換中のEnter/Escは文字入力の操作(design.md D5・spec「セル編集」)
    if (composingRef.current) return
    if (e.key === 'Enter') {
      e.preventDefault()
      commitEditing('down')
    } else if (e.key === 'Tab') {
      e.preventDefault()
      commitEditing('right')
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setEditing(null)
    }
  }

  function cellId(row: number, col: number): string {
    return `person-table-cell-${row}-${col}`
  }

  /** フォーカスセルが変わったら、rovingフォーカスを実セルへ移す */
  useEffect(() => {
    if (!focus || editing) return
    const cell = rootRef.current?.querySelector<HTMLElement>(
      `#${cellId(focus.row, focus.col)}`,
    )
    cell?.focus()
  }, [focus, editing])

  const sortIndicator = (column: TableColumn) => {
    if (sort?.columnId !== column.id) return undefined
    return sort.direction === 'asc' ? 'ascending' : 'descending'
  }

  function toggleSort(column: TableColumn) {
    if (!column.sortable) return
    // 編集モード中は並べ替えを固定する(design.md D5)
    if (mode === 'edit') return
    setSort((prev) =>
      prev?.columnId === column.id
        ? prev.direction === 'asc'
          ? { columnId: column.id, direction: 'desc' }
          : null
        : { columnId: column.id, direction: 'asc' },
    )
  }

  return (
    <div className="person-table-view" ref={rootRef}>
      <div className="person-table-toolbar">
        <label className="person-table-filter">
          氏名で検索
          <input
            className="field field--sm"
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="氏名・ふりがな"
          />
        </label>
        {hasActiveFilter ? (
          <button
            type="button"
            className="btn btn--outline person-table-clear-filters"
            onClick={clearAllFilters}
          >
            絞り込みを解除
          </button>
        ) : null}
        <p className="person-table-count" aria-live="polite">
          {rows.length} / {Object.keys(doc.persons).length}人
        </p>
        <div
          className="segmented segmented--framed person-table-mode"
          role="group"
          aria-label="表の操作モード"
        >
          <button
            type="button"
            className="segmented-item"
            aria-pressed={mode === 'browse'}
            onClick={exitEditMode}
          >
            閲覧
          </button>
          <button
            type="button"
            className="segmented-item"
            aria-pressed={mode === 'edit'}
            onClick={enterEditMode}
          >
            編集
          </button>
        </div>
      </div>

      {mode === 'edit' ? (
        <p className="person-table-edit-hint">
          セルを選んで入力・Ctrl+C/Ctrl+Vで表計算ソフトと貼り付けし合えます。関係
          (親子・配偶者)と削除は図・パネル側で操作してください
        </p>
      ) : null}

      {pasteSummary ? (
        <p className="person-table-paste-summary" role="status">
          {pasteSummary}
          <button
            type="button"
            className="btn btn--text person-table-paste-summary-close"
            aria-label="この通知を閉じる"
            onClick={() => setPasteSummary(null)}
          >
            ×
          </button>
        </p>
      ) : null}

      <div
        className="person-table-scroll"
        onCopy={handleCopy}
        onPaste={handlePaste}
        onKeyDown={handleGridKeyDown}
      >
        <table
          role="grid"
          aria-label="人物の一覧"
          aria-rowcount={rowCount + 2}
          className={mode === 'edit' ? 'person-table editing' : 'person-table'}
        >
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.id}
                  role="columnheader"
                  scope="col"
                  aria-sort={sortIndicator(column)}
                  data-column-id={column.id}
                >
                  {column.sortable ? (
                    <button
                      type="button"
                      className="btn btn--text person-table-sort-button"
                      // 編集モード中は行順を固定する(design.md D5・D8)。
                      // ボタンを消すと「壊れた」と読めるため、無効化して理由を示す
                      disabled={mode === 'edit'}
                      title={
                        mode === 'edit'
                          ? '編集モード中は並べ替えできません(行の対応がずれるため)'
                          : `${column.label}で並べ替え`
                      }
                      onClick={() => toggleSort(column)}
                    >
                      {column.label}
                      {sort?.columnId === column.id
                        ? sort.direction === 'asc'
                          ? ' ↑'
                          : ' ↓'
                        : ''}
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              ))}
            </tr>
            {/* 列ごとの絞り込み行(design.md D8)。columnheaderを二重に持たせないよう
                td で組む(thead 内の td はHTML5で妥当) */}
            <tr className="person-table-filter-row">
              {columns.map((column) => (
                <td key={column.id} data-column-id={column.id}>
                  {column.filterKind === 'select' ? (
                    <select
                      className="field field--xs field--block"
                      aria-label={`${column.label}で絞り込み`}
                      value={columnFilters[column.id] ?? ''}
                      onChange={(e) =>
                        setColumnFilters((prev) => ({
                          ...prev,
                          [column.id]: e.target.value,
                        }))
                      }
                    >
                      <option value="">すべて</option>
                      {column.filterOptions?.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="field field--xs field--block"
                      type="search"
                      aria-label={`${column.label}で絞り込み`}
                      value={columnFilters[column.id] ?? ''}
                      onChange={(e) =>
                        setColumnFilters((prev) => ({
                          ...prev,
                          [column.id]: e.target.value,
                        }))
                      }
                    />
                  )}
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((person, rowIndex) => (
              <tr
                key={person.id}
                data-person-id={person.id}
                aria-selected={person.id === selectedPersonId}
                className={
                  person.id === selectedPersonId ? 'selected-row' : undefined
                }
                onClick={() => {
                  if (mode === 'browse') onSelectPerson(person.id)
                }}
              >
                {columns.map((column, colIndex) => {
                  const error = cellErrors.get(
                    cellMarkerKey(person.id, rowIndex, column.id),
                  )
                  const isEditingCell =
                    editing?.row === rowIndex && editing.col === colIndex
                  return (
                    <td
                      key={column.id}
                      id={cellId(rowIndex, colIndex)}
                      role="gridcell"
                      tabIndex={
                        mode === 'edit' &&
                        focus?.row === rowIndex &&
                        focus.col === colIndex
                          ? 0
                          : -1
                      }
                      aria-selected={
                        mode === 'edit'
                          ? isSelected(rowIndex, colIndex)
                          : undefined
                      }
                      aria-invalid={error ? true : undefined}
                      title={error?.message}
                      className={[
                        isSelected(rowIndex, colIndex) ? 'cell-selected' : '',
                        focus?.row === rowIndex && focus.col === colIndex
                          ? 'cell-focused'
                          : '',
                        error ? 'cell-error' : '',
                        column.editable ? '' : 'cell-readonly',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onMouseDown={(e) => {
                        if (mode !== 'edit') return
                        if (e.shiftKey && focus) {
                          setAnchor(anchor ?? focus)
                          setFocus({ row: rowIndex, col: colIndex })
                        } else {
                          setAnchor(null)
                          setFocus({ row: rowIndex, col: colIndex })
                        }
                      }}
                      onDoubleClick={() =>
                        startEditing({ row: rowIndex, col: colIndex })
                      }
                    >
                      {isEditingCell ? (
                        <CellEditor
                          column={column}
                          draft={editing.draft}
                          onDraftChange={(draft) =>
                            setEditing((prev) =>
                              prev ? { ...prev, draft } : prev,
                            )
                          }
                          onKeyDown={handleEditorKeyDown}
                          onBlur={() => commitEditing('none')}
                          onCompositionChange={(composing) => {
                            composingRef.current = composing
                          }}
                          editorRef={editorRef}
                        />
                      ) : (
                        column.getValue(person, ctx)
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
            {mode === 'edit' ? (
              <tr className="person-table-ghost-row" data-ghost-row="">
                {columns.map((column, colIndex) => {
                  const error = cellErrors.get(
                    cellMarkerKey(undefined, ghostRowIndex, column.id),
                  )
                  const isEditingCell =
                    editing?.row === ghostRowIndex && editing.col === colIndex
                  return (
                    <td
                      key={column.id}
                      id={cellId(ghostRowIndex, colIndex)}
                      role="gridcell"
                      tabIndex={
                        focus?.row === ghostRowIndex && focus.col === colIndex
                          ? 0
                          : -1
                      }
                      aria-selected={isSelected(ghostRowIndex, colIndex)}
                      aria-invalid={error ? true : undefined}
                      title={error?.message}
                      className={[
                        focus?.row === ghostRowIndex && focus.col === colIndex
                          ? 'cell-focused'
                          : '',
                        error ? 'cell-error' : '',
                        column.editable ? '' : 'cell-readonly',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onMouseDown={() => {
                        setAnchor(null)
                        setFocus({ row: ghostRowIndex, col: colIndex })
                      }}
                      onDoubleClick={() =>
                        startEditing({ row: ghostRowIndex, col: colIndex })
                      }
                    >
                      {isEditingCell ? (
                        <CellEditor
                          column={column}
                          draft={editing.draft}
                          onDraftChange={(draft) =>
                            setEditing((prev) =>
                              prev ? { ...prev, draft } : prev,
                            )
                          }
                          onKeyDown={handleEditorKeyDown}
                          onBlur={() => commitEditing('none')}
                          onCompositionChange={(composing) => {
                            composingRef.current = composing
                          }}
                          editorRef={editorRef}
                        />
                      ) : colIndex === 0 ? (
                        <span className="person-table-ghost-hint">
                          新しい人物…
                        </span>
                      ) : (
                        ''
                      )}
                    </td>
                  )
                })}
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}

interface CellEditorProps {
  column: TableColumn
  draft: string
  onDraftChange: (draft: string) => void
  onKeyDown: (
    e: ReactKeyboardEvent<HTMLInputElement | HTMLSelectElement>,
  ) => void
  onBlur: () => void
  onCompositionChange: (composing: boolean) => void
  editorRef: { current: HTMLInputElement | HTMLSelectElement | null }
}

/** セルのエディタ。性別のみ値の揺れを防ぐためselectにする(design.md D5) */
function CellEditor({
  column,
  draft,
  onDraftChange,
  onKeyDown,
  onBlur,
  onCompositionChange,
  editorRef,
}: CellEditorProps) {
  if (column.id === 'gender') {
    return (
      <select
        ref={(el) => {
          editorRef.current = el
        }}
        aria-label={column.label}
        value={draft || '不明'}
        onChange={(e) => onDraftChange(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
      >
        <option value="男">男</option>
        <option value="女">女</option>
        <option value="不明">不明</option>
      </select>
    )
  }
  return (
    <input
      ref={(el) => {
        editorRef.current = el
      }}
      aria-label={column.label}
      type="text"
      value={draft}
      onChange={(e) => onDraftChange(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      onCompositionStart={() => onCompositionChange(true)}
      onCompositionEnd={() => onCompositionChange(false)}
    />
  )
}

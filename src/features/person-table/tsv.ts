/**
 * 表形式ビューのクリップボード形式(TSV)の直列化・パース(design.md D4)。
 *
 * Excel・Google スプレッドシートが `text/plain` で使う方言に合わせる:
 * - セルはタブ区切り、行は改行区切り(書き出しは Excel ネイティブの CRLF)
 * - タブ・改行・ダブルクォートを含むセルはダブルクォートで囲み、
 *   セル内のダブルクォートは2つ重ねる(`"` → `""`)
 * - セル内改行(Excel の Alt+Enter)は引用の内側にそのまま現れる
 *
 * ライブラリ非依存の純関数として実装し、テーブル実装(またはプランBの
 * Tabulator 移行時)から独立してテスト・再利用できるようにする。
 */

/** 引用が必要な文字。タブ=列区切り、改行=行区切り、引用符=エスケープ開始と衝突する */
const NEEDS_QUOTING = /[\t\n\r"]/

/** 2次元のセル文字列を、表計算ソフトへ貼り付け可能なTSVテキストへ直列化する */
export function serializeTsv(
  rows: ReadonlyArray<ReadonlyArray<string>>,
): string {
  return rows
    .map((row) =>
      row
        .map((cell) =>
          NEEDS_QUOTING.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell,
        )
        .join('\t'),
    )
    .join('\r\n')
}

/**
 * 表計算ソフトからのTSVテキストを行×列のセル文字列へパースする。
 *
 * - 行区切りは CRLF / LF / CR のいずれも受理する(Excel=CRLF、Google=LF)
 * - セルの先頭がダブルクォートの場合のみ引用モードで読む。引用内の `""` は
 *   リテラルの `"`、引用内の改行はセル値の一部(CRLFはLFへ正規化して
 *   アプリ内のtextarea値と揃える)
 * - 閉じ引用の後に区切りまで文字が続く崩れた入力は、そのまま値へ連結する
 *   (表計算ソフトの寛容な挙動に合わせ、パース失敗にしない)
 * - 末尾の行区切り1つは無視する(Excelのコピーは常に末尾CRLFを付けるため、
 *   意図しない空行として扱わない)。全体が空になった場合は0行を返す
 */
export function parseTsv(text: string): string[][] {
  const stripped = text.replace(/\r\n$|\r$|\n$/, '')
  if (stripped === '') return []

  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  let i = 0

  const endCell = () => {
    row.push(cell)
    cell = ''
  }
  const endRow = () => {
    endCell()
    rows.push(row)
    row = []
  }

  while (i < stripped.length) {
    const ch = stripped[i]

    if (inQuotes) {
      if (ch === '"') {
        if (stripped[i + 1] === '"') {
          cell += '"'
          i += 2
        } else {
          inQuotes = false
          i += 1
        }
      } else if (ch === '\r') {
        // 引用内の改行はセル値。CRLF/CRをLFへ正規化する
        cell += '\n'
        i += stripped[i + 1] === '\n' ? 2 : 1
      } else {
        cell += ch
        i += 1
      }
      continue
    }

    if (ch === '"' && cell === '') {
      inQuotes = true
      i += 1
    } else if (ch === '\t') {
      endCell()
      i += 1
    } else if (ch === '\r' || ch === '\n') {
      endRow()
      i += ch === '\r' && stripped[i + 1] === '\n' ? 2 : 1
    } else {
      cell += ch
      i += 1
    }
  }
  endRow()

  return rows
}

import type { ImportSummaryInfo } from './ImportPanel'

const ENCODING_LABEL: Record<string, string> = {
  'utf-8': 'UTF-8',
  'utf-16': 'UTF-16',
  shift_jis: 'Shift_JIS',
}

interface ImportSummaryProps {
  summary: ImportSummaryInfo
}

export function ImportSummary({ summary }: ImportSummaryProps) {
  return (
    <section className="import-summary" aria-live="polite">
      <h3>読み込み結果</h3>
      <p>
        人物 {summary.peopleCount}名・家族 {summary.familiesCount}
        件を読み込みました。
        {summary.format === 'gedcom' && summary.gedcomVersion && (
          <>
            (GEDCOM {summary.gedcomVersion}
            {summary.encoding &&
              `、文字コード: ${ENCODING_LABEL[summary.encoding] ?? summary.encoding}として読み込み`}
            )
          </>
        )}
      </p>
      {summary.warnings.length > 0 ? (
        <div className="import-summary__warnings">
          <p>
            {summary.warnings.length}
            件の警告があります(データは読み込まれています):
          </p>
          <ul>
            {summary.warnings.map((warning, index) => (
              <li key={index}>
                {warning.lineNumber !== undefined &&
                  `${warning.lineNumber}行目: `}
                {warning.tag && `[${warning.tag}] `}
                {warning.message}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="import-summary__ok">警告はありません。</p>
      )}
    </section>
  )
}

import { displayName } from '../domain/helpers'
import type { PersonId } from '../domain/types'
import { useTreeStore } from '../store/tree-store'
import './UnconnectedTray.css'

interface UnconnectedTrayProps {
  /** 図に現れていない人物のID(`computeOffChartPersonIds`の結果) */
  personIds: PersonId[]
  selectedPersonId: PersonId | null
  onSelectPerson: (personId: PersonId) => void
}

/**
 * 図に現れていない人物の一覧(spec tree-rendering、design.md D5/D6)。
 *
 * 関係を持たない人物は`main_id`からのfamily-chartの走査に乗らず、非表示人数バッジの
 * 隣接にも現れないため、この一覧がないとキャンバス上に一切現れない。関係を先に決めずに
 * 人物を登録する使い方と、関係を解除して繋ぎ変える使い方の双方で、対象の人物を見失わない
 * ようにするための受け皿。
 *
 * カードはキャンバス本体の縦書き描画(family-chartのレイアウトに紐づく)を再利用せず、
 * 氏名で識別できる軽量なチップに留める(design.md D6)。対象が0人のときは領域ごと描かない。
 */
export function UnconnectedTray({
  personIds,
  selectedPersonId,
  onSelectPerson,
}: UnconnectedTrayProps) {
  const persons = useTreeStore((s) => s.document.persons)

  if (personIds.length === 0) return null

  return (
    <div className="unconnected-tray" aria-label="図に現れていない人物">
      <p className="unconnected-tray-title">
        図に現れていない人物
        <span className="unconnected-tray-count">{personIds.length}</span>
      </p>
      <ul className="unconnected-tray-list">
        {personIds.map((id) => {
          const person = persons[id]
          if (!person) return null
          return (
            <li key={id}>
              <button
                type="button"
                className="btn btn--tight unconnected-tray-chip"
                aria-pressed={id === selectedPersonId}
                onClick={() => onSelectPerson(id)}
              >
                {displayName(person)}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

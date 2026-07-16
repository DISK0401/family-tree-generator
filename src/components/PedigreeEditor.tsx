import { setChildPedigree } from '../domain/commands'
import { displayName } from '../domain/helpers'
import type { Pedigree, PersonId, TreeDocument } from '../domain/types'
import { useTreeStore } from '../store/tree-store'
import './PedigreeEditor.css'

const PEDIGREE_LABEL: Record<Pedigree, string> = {
  biological: '実子',
  adopted: '養子',
  step: '継子',
  foster: '里子',
  unknown: '不明',
}

interface PedigreeEditorProps {
  personId: PersonId
}

function parentNames(doc: TreeDocument, spouseIds: PersonId[]): string {
  const names = spouseIds.map((id) => (doc.persons[id] ? displayName(doc.persons[id]) : '(不明)'))
  return names.length > 0 ? names.join('・') : '(親未登録)'
}

/**
 * 選択中人物が子として帰属する家族ごとの続柄種別編集。
 * 複数家族に子として属す場合(実親+養親等)、それぞれ独立して編集できる(spec family-data-model)。
 */
export function PedigreeEditor({ personId }: PedigreeEditorProps) {
  const apply = useTreeStore((s) => s.apply)
  const document = useTreeStore((s) => s.document)

  const familiesAsChild = Object.values(document.families).filter((f) =>
    f.children.some((c) => c.childId === personId),
  )

  if (familiesAsChild.length === 0) return null

  return (
    <div className="pedigree-editor">
      <h3 className="pedigree-editor-title">続柄</h3>
      {familiesAsChild.map((family) => {
        const link = family.children.find((c) => c.childId === personId)
        if (!link) return null
        const selectId = `pedigree-${family.id}`
        return (
          <label key={family.id} htmlFor={selectId} className="pedigree-editor-row">
            <span className="pedigree-editor-parents">{parentNames(document, family.spouseIds)}</span>
            <select
              id={selectId}
              value={link.pedigree}
              onChange={(e) =>
                apply((doc) => setChildPedigree(doc, family.id, personId, e.target.value as Pedigree))
              }
            >
              {(Object.keys(PEDIGREE_LABEL) as Pedigree[]).map((p) => (
                <option key={p} value={p}>
                  {PEDIGREE_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
        )
      })}
    </div>
  )
}

import { useState } from 'react'
import {
  computeUnlinkImpact,
  unlinkChild,
  unlinkSpouse,
} from '../../domain/commands'
import { displayName } from '../../domain/helpers'
import type { FamilyId, PersonId } from '../../domain/types'
import { useTreeStore } from '../../store/tree-store'
import { ConfirmDialog } from '../../molecules/ConfirmDialog'
import './UnlinkRelationControl.css'

interface UnlinkRelationControlProps {
  familyId: FamilyId
  /** 外す対象。子リンクを外すか、配偶者参照を外すか */
  kind: 'child' | 'spouse'
  personId: PersonId
  /** ボタンの文言 */
  label: string
  /** 確認ダイアログの見出し */
  title: string
}

/**
 * 関係リンクの解除(spec tree-editor「関係リンクの解除」)。
 *
 * 人物を削除せずに関係だけを外すため、誤った役割で登録した人物を、入力済みの氏名・生没日・
 * メモを保ったまま繋ぎ変えられる。人物の削除・婚姻単位の削除と同様、実行前に失われるものを
 * 提示して確認を求める。提示内容は`computeUnlinkImpact`が返す値のみに基づき、その関数は
 * 実際の解除コマンドを実行した結果を観測するため、予告と実行が食い違うことがない
 * (design.md D4)。
 */
export function UnlinkRelationControl({
  familyId,
  kind,
  personId,
  label,
  title,
}: UnlinkRelationControlProps) {
  const document = useTreeStore((s) => s.document)
  const apply = useTreeStore((s) => s.apply)
  const [open, setOpen] = useState(false)

  const person = document.persons[personId]
  if (!person || !document.families[familyId]) return null

  const impact = computeUnlinkImpact(document, familyId, { kind, personId })
  const lostParts = [
    impact.removedFamilyEventCount > 0 &&
      `婚姻・離婚の記録${impact.removedFamilyEventCount}件`,
    impact.orphanedChildCount > 0 &&
      `子${impact.orphanedChildCount}人の親としての帰属`,
  ].filter(Boolean)

  function handleConfirm() {
    apply((doc) =>
      kind === 'child'
        ? unlinkChild(doc, familyId, personId)
        : unlinkSpouse(doc, familyId, personId),
    )
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        className="btn btn--text unlink-relation-trigger"
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
      {open && (
        <ConfirmDialog
          title={title}
          alertdialog
          confirmLabel="解除する"
          confirmDanger
          onConfirm={handleConfirm}
          onCancel={() => setOpen(false)}
        >
          <p>
            {/* 家族ごと消える場合は、その家族に記録された内容も失われる旨を必ず示す */}
            {impact.familyRemoved && (
              <>
                この関係を外すと家族(婚姻の単位)そのものが失われます。
                {lostParts.length > 0 &&
                  `${lostParts.join('・')}も失われます。`}
              </>
            )}
            人物そのものは削除されません。
            {/* 解除後に図から外れる場合、消えたのではなく一覧へ移ることを事前に伝える */}
            {impact.becomesUnconnected &&
              `${displayName(person)}さんは図から外れ、「図に現れていない人物」の一覧へ移ります。`}
            解除後すぐであれば「元に戻す」で復元できます。
          </p>
        </ConfirmDialog>
      )}
    </>
  )
}

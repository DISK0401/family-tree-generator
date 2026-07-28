import { beforeEach, describe, expect, it } from 'vitest'
import {
  addChild,
  addChildLink,
  addPerson,
  updatePerson,
} from '../domain/commands'
import { createTreeDocument } from '../domain/helpers'
import { useTreeStore } from './tree-store'

beforeEach(() => {
  useTreeStore.getState().replace(createTreeDocument())
})

describe('apply', () => {
  it('コマンドの戻り値がdocumentへ反映され、履歴が積まれる', () => {
    const store = useTreeStore.getState()
    store.apply((doc) => addPerson(doc, { name: { given: '太郎' } }).doc)
    const state = useTreeStore.getState()
    expect(Object.values(state.document.persons)).toHaveLength(1)
    expect(state.canUndo()).toBe(true)
    expect(state.canRedo()).toBe(false)
  })
})

describe('apply: no-op(同一参照が返る)', () => {
  it('履歴を積まず、redo履歴(future)も消えない', () => {
    const store = useTreeStore.getState()
    store.apply((doc) => addPerson(doc, { name: { given: '太郎' } }).doc)
    useTreeStore.getState().undo()
    expect(useTreeStore.getState().canRedo()).toBe(true)
    const pastLength = useTreeStore.getState().past.length

    useTreeStore.getState().apply((doc) => doc)

    const state = useTreeStore.getState()
    expect(state.past).toHaveLength(pastLength)
    expect(state.canRedo()).toBe(true)
    // redoは引き続き機能する
    state.redo()
    expect(
      Object.values(useTreeStore.getState().document.persons),
    ).toHaveLength(1)
  })

  it('no-opコマンド(既にその家族の子)ではdocumentも履歴も変化しない', () => {
    const store = useTreeStore.getState()
    let familyId = ''
    let childId = ''
    store.apply((doc) => {
      const a = addPerson(doc, { name: { given: 'A' } })
      const c = addChild(a.doc, a.personId, { name: { given: 'C' } })
      familyId = c.familyId
      childId = c.childId
      return c.doc
    })
    const before = useTreeStore.getState()

    useTreeStore
      .getState()
      .apply((doc) => addChildLink(doc, familyId, childId, 'biological'))

    const after = useTreeStore.getState()
    expect(after.document).toBe(before.document)
    expect(after.past).toHaveLength(before.past.length)
  })
})

describe('undo/redo', () => {
  it('人物追加→氏名変更のあとundo2回・redo1回で正しい順序に戻る', () => {
    const store = useTreeStore.getState()
    let personId = ''
    store.apply((doc) => {
      const r = addPerson(doc, { name: { given: '太郎' } })
      personId = r.personId
      return r.doc
    })
    store.apply((doc) =>
      updatePerson(doc, personId, { name: { given: '次郎' } }),
    )

    expect(useTreeStore.getState().document.persons[personId].name.given).toBe(
      '次郎',
    )

    useTreeStore.getState().undo()
    expect(useTreeStore.getState().document.persons[personId].name.given).toBe(
      '太郎',
    )

    useTreeStore.getState().undo()
    expect(
      Object.values(useTreeStore.getState().document.persons),
    ).toHaveLength(0)

    useTreeStore.getState().redo()
    expect(
      Object.values(useTreeStore.getState().document.persons),
    ).toHaveLength(1)
    expect(useTreeStore.getState().document.persons[personId].name.given).toBe(
      '太郎',
    )
  })

  it('undo後に新しい操作をするとfutureが破棄される', () => {
    const store = useTreeStore.getState()
    let personId = ''
    store.apply((doc) => {
      const r = addPerson(doc, { name: { given: '太郎' } })
      personId = r.personId
      return r.doc
    })
    store.apply((doc) =>
      updatePerson(doc, personId, { name: { given: '次郎' } }),
    )
    useTreeStore.getState().undo()
    expect(useTreeStore.getState().canRedo()).toBe(true)

    useTreeStore
      .getState()
      .apply((doc) => updatePerson(doc, personId, { name: { given: '三郎' } }))
    expect(useTreeStore.getState().canRedo()).toBe(false)
    expect(useTreeStore.getState().document.persons[personId].name.given).toBe(
      '三郎',
    )
  })

  it('履歴が50操作以上あってもundo/redoの順序が保たれる', () => {
    const store = useTreeStore.getState()
    let personId = ''
    store.apply((doc) => {
      const r = addPerson(doc, { name: { given: '0' } })
      personId = r.personId
      return r.doc
    })
    for (let i = 1; i <= 60; i++) {
      useTreeStore
        .getState()
        .apply((doc) =>
          updatePerson(doc, personId, { name: { given: String(i) } }),
        )
    }
    expect(useTreeStore.getState().document.persons[personId].name.given).toBe(
      '60',
    )

    for (let i = 0; i < 55; i++) useTreeStore.getState().undo()
    // 履歴上限100件のため、60回の更新+初期追加=61操作は全てundo可能
    expect(useTreeStore.getState().document.persons[personId].name.given).toBe(
      '5',
    )

    for (let i = 0; i < 55; i++) useTreeStore.getState().redo()
    expect(useTreeStore.getState().document.persons[personId].name.given).toBe(
      '60',
    )
  })

  it('履歴なしでのundo/redoは何もしない', () => {
    const store = useTreeStore.getState()
    const before = useTreeStore.getState().document
    store.undo()
    store.redo()
    expect(useTreeStore.getState().document).toEqual(before)
  })

  it('undoで復元されるdocumentは適用前と同一の参照(クローンではない)', () => {
    const store = useTreeStore.getState()
    store.apply((doc) => addPerson(doc, { name: { given: '太郎' } }).doc)
    const before = useTreeStore.getState().document

    useTreeStore
      .getState()
      .apply((doc) => addPerson(doc, { name: { given: '次郎' } }).doc)
    useTreeStore.getState().undo()

    expect(useTreeStore.getState().document).toBe(before)
  })

  it('履歴上限(100件)到達後は最古の操作分が切り捨てられ、それ以上は戻れない', () => {
    const store = useTreeStore.getState()
    let personId = ''
    store.apply((doc) => {
      const r = addPerson(doc, { name: { given: '0' } })
      personId = r.personId
      return r.doc
    })
    // 合計106操作(追加1回+更新105回)で、上限100件を超える
    for (let i = 1; i <= 105; i++) {
      useTreeStore
        .getState()
        .apply((doc) =>
          updatePerson(doc, personId, { name: { given: String(i) } }),
        )
    }
    expect(useTreeStore.getState().past).toHaveLength(100)
    expect(useTreeStore.getState().document.persons[personId].name.given).toBe(
      '105',
    )

    let undoCount = 0
    while (useTreeStore.getState().canUndo()) {
      useTreeStore.getState().undo()
      undoCount++
    }
    // 最初の6操作分(追加+更新5回)は切り捨てられており、100回で打ち止め
    expect(undoCount).toBe(100)
    expect(useTreeStore.getState().document.persons[personId].name.given).toBe(
      '5',
    )

    // それ以上undoしても変化しない
    useTreeStore.getState().undo()
    expect(useTreeStore.getState().document.persons[personId].name.given).toBe(
      '5',
    )
  })
})

describe('replace', () => {
  it('履歴をリセットしてdocumentを差し替える', () => {
    const store = useTreeStore.getState()
    store.apply((doc) => addPerson(doc, { name: { given: '太郎' } }).doc)
    expect(useTreeStore.getState().canUndo()).toBe(true)

    const fresh = useTreeStore.getState().document
    store.replace({ ...fresh, persons: {}, families: {} })
    expect(useTreeStore.getState().canUndo()).toBe(false)
    expect(useTreeStore.getState().canRedo()).toBe(false)
    expect(
      Object.values(useTreeStore.getState().document.persons),
    ).toHaveLength(0)
  })
})

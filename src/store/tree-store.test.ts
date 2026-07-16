import { beforeEach, describe, expect, it } from 'vitest'
import { addPerson, updatePerson } from '../domain/commands'
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

describe('undo/redo', () => {
  it('人物追加→氏名変更のあとundo2回・redo1回で正しい順序に戻る', () => {
    const store = useTreeStore.getState()
    let personId = ''
    store.apply((doc) => {
      const r = addPerson(doc, { name: { given: '太郎' } })
      personId = r.personId
      return r.doc
    })
    store.apply((doc) => updatePerson(doc, personId, { name: { given: '次郎' } }))

    expect(useTreeStore.getState().document.persons[personId].name.given).toBe('次郎')

    useTreeStore.getState().undo()
    expect(useTreeStore.getState().document.persons[personId].name.given).toBe('太郎')

    useTreeStore.getState().undo()
    expect(Object.values(useTreeStore.getState().document.persons)).toHaveLength(0)

    useTreeStore.getState().redo()
    expect(Object.values(useTreeStore.getState().document.persons)).toHaveLength(1)
    expect(useTreeStore.getState().document.persons[personId].name.given).toBe('太郎')
  })

  it('undo後に新しい操作をするとfutureが破棄される', () => {
    const store = useTreeStore.getState()
    let personId = ''
    store.apply((doc) => {
      const r = addPerson(doc, { name: { given: '太郎' } })
      personId = r.personId
      return r.doc
    })
    store.apply((doc) => updatePerson(doc, personId, { name: { given: '次郎' } }))
    useTreeStore.getState().undo()
    expect(useTreeStore.getState().canRedo()).toBe(true)

    useTreeStore.getState().apply((doc) => updatePerson(doc, personId, { name: { given: '三郎' } }))
    expect(useTreeStore.getState().canRedo()).toBe(false)
    expect(useTreeStore.getState().document.persons[personId].name.given).toBe('三郎')
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
      useTreeStore.getState().apply((doc) => updatePerson(doc, personId, { name: { given: String(i) } }))
    }
    expect(useTreeStore.getState().document.persons[personId].name.given).toBe('60')

    for (let i = 0; i < 55; i++) useTreeStore.getState().undo()
    // 履歴上限100件のため、60回の更新+初期追加=61操作は全てundo可能
    expect(useTreeStore.getState().document.persons[personId].name.given).toBe('5')

    for (let i = 0; i < 55; i++) useTreeStore.getState().redo()
    expect(useTreeStore.getState().document.persons[personId].name.given).toBe('60')
  })

  it('履歴なしでのundo/redoは何もしない', () => {
    const store = useTreeStore.getState()
    const before = useTreeStore.getState().document
    store.undo()
    store.redo()
    expect(useTreeStore.getState().document).toEqual(before)
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
    expect(Object.values(useTreeStore.getState().document.persons)).toHaveLength(0)
  })
})

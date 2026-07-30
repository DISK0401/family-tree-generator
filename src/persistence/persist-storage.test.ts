import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isPersistentStorageSupported,
  isStoragePersisted,
  requestPersistentStorage,
} from './persist-storage'

/*
 * navigator.storage はjsdomに存在しないため、definePropertyで注入してテストする。
 * 他テストへ汚染が漏れないよう、afterEachで必ず元の状態へ復元する。
 */
const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'storage')

function defineStorage(value: unknown) {
  Object.defineProperty(navigator, 'storage', { configurable: true, value })
}

afterEach(() => {
  if (originalDescriptor) {
    Object.defineProperty(navigator, 'storage', originalDescriptor)
  } else {
    delete (navigator as unknown as Record<string, unknown>).storage
  }
  vi.restoreAllMocks()
})

describe('isPersistentStorageSupported', () => {
  it('navigator.storageが無い(未対応ブラウザ)場合はfalse', () => {
    expect(isPersistentStorageSupported()).toBe(false)
  })

  it('persist関数がある場合はtrue', () => {
    defineStorage({ persist: () => Promise.resolve(true) })
    expect(isPersistentStorageSupported()).toBe(true)
  })
})

describe('requestPersistentStorage', () => {
  it('未対応ブラウザでは例外を投げずfalseを返す', async () => {
    await expect(requestPersistentStorage()).resolves.toBe(false)
  })

  it('persist()が許可した場合はtrue', async () => {
    defineStorage({ persist: vi.fn().mockResolvedValue(true) })
    await expect(requestPersistentStorage()).resolves.toBe(true)
  })

  it('persist()が拒否した場合はfalse', async () => {
    defineStorage({ persist: vi.fn().mockResolvedValue(false) })
    await expect(requestPersistentStorage()).resolves.toBe(false)
  })

  it('persist()がthrowしてもfalseに落ちる', async () => {
    defineStorage({
      persist: vi.fn().mockRejectedValue(new Error('denied')),
    })
    await expect(requestPersistentStorage()).resolves.toBe(false)
  })
})

describe('isStoragePersisted', () => {
  it('未対応ブラウザでは例外を投げずfalseを返す', async () => {
    await expect(isStoragePersisted()).resolves.toBe(false)
  })

  it('persisted()の結果をそのまま返す', async () => {
    defineStorage({ persisted: vi.fn().mockResolvedValue(true) })
    await expect(isStoragePersisted()).resolves.toBe(true)

    defineStorage({ persisted: vi.fn().mockResolvedValue(false) })
    await expect(isStoragePersisted()).resolves.toBe(false)
  })

  it('persisted()がthrowしてもfalseに落ちる', async () => {
    defineStorage({
      persisted: vi.fn().mockRejectedValue(new Error('denied')),
    })
    await expect(isStoragePersisted()).resolves.toBe(false)
  })
})

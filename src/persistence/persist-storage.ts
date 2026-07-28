/**
 * navigator.storage による永続ストレージの要求・確認。
 * 未対応ブラウザでも例外を投げず、結果を素直に返す(design.md D5 / spec local-autosave)。
 */

/** navigator.storage.persist() が使えるブラウザか */
export function isPersistentStorageSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'storage' in navigator &&
    typeof navigator.storage?.persist === 'function'
  )
}

/**
 * 永続ストレージを要求する。true = 許可、false = 拒否または未対応。
 * false の場合、IndexedDB は容量逼迫時にブラウザ判断で削除(退避)され得る。
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!isPersistentStorageSupported()) return false
  try {
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

/** すでに永続ストレージが許可済みか。未対応ブラウザでは false */
export async function isStoragePersisted(): Promise<boolean> {
  if (
    typeof navigator === 'undefined' ||
    !('storage' in navigator) ||
    typeof navigator.storage?.persisted !== 'function'
  ) {
    return false
  }
  try {
    return await navigator.storage.persisted()
  } catch {
    return false
  }
}

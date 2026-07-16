/**
 * navigator.storage.persist() による永続ストレージの要求。
 * 未対応ブラウザでも例外を投げず、結果を素直に返す(design.md D5 / spec local-autosave)。
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!('storage' in navigator) || !navigator.storage?.persist) return false
  try {
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export const MAX_IMPORT_FILE_SIZE = 20 * 1024 * 1024

/**
 * エクスポートファイル名に付与する14桁タイムスタンプ(design.md D10)。
 * ローカル時刻(端末のタイムゾーン)の `yyyyMMddHHmmss` を返す。
 * 短時間に複数回エクスポートしてもファイル名が重複しないようにするための識別子。
 */
export function formatExportTimestamp(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    String(date.getFullYear()) +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds())
  )
}

export type DetectedFileFormat = 'gedcom' | 'json' | 'unknown'

export function detectFileFormat(filename: string): DetectedFileFormat {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.ged') || lower.endsWith('.gedcom')) {
    return 'gedcom'
  }
  if (lower.endsWith('.json')) {
    return 'json'
  }
  return 'unknown'
}

export async function readFileAsBytes(file: File): Promise<Uint8Array> {
  const buffer = await file.arrayBuffer()
  return new Uint8Array(buffer)
}

export function downloadBytes(
  bytes: Uint8Array,
  filename: string,
  mimeType: string,
): void {
  const blob = new Blob([new Uint8Array(bytes)], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function downloadText(
  text: string,
  filename: string,
  mimeType: string,
): void {
  downloadBytes(new TextEncoder().encode(text), filename, mimeType)
}

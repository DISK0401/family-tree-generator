/** Person/Family の一意なIDを採番する。 */
export function createId(): string {
  return crypto.randomUUID()
}

import type { PersonName } from '../domain/types'

export function nameFromFields(surname: string, given: string): PersonName {
  return {
    ...(surname.trim() && { surname: surname.trim() }),
    ...(given.trim() && { given: given.trim() }),
  }
}

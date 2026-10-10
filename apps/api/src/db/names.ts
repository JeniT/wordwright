/** A stored list of names; anything unreadable is no one, rather than an error on every page that shows the item. */
export function parseNames(stored: unknown): string[] {
  try {
    const names = JSON.parse(String(stored))
    return Array.isArray(names) ? names.filter((n): n is string => typeof n === 'string') : []
  } catch {
    return []
  }
}

/** Anything that carries tags: a note, a reading-list item. */
type Tagged = { tags: readonly string[] }

/** "intro, Part 2 , " → ["intro", "Part 2"]: tidied, empty ones dropped, repeats (ignoring case) dropped. */
export function parseTags(text: string): string[] {
  const seen = new Set<string>()
  const tags: string[] = []
  for (const part of text.split(',')) {
    const tag = part.trim().replace(/\s+/g, ' ')
    if (tag && !seen.has(tag.toLowerCase())) {
      seen.add(tag.toLowerCase())
      tags.push(tag)
    }
  }
  return tags
}

export const tagsToText = (tags: readonly string[]) => tags.join(', ')

export const sameTags = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((t, i) => t.toLowerCase() === b[i]!.toLowerCase())

/** Every tag used on these, once each (ignoring case, first spelling kept), in the order first met. */
export function tagsUsedOn(items: readonly Tagged[]): string[] {
  const seen = new Map<string, string>()
  for (const item of items)
    for (const tag of item.tags) seen.set(tag.toLowerCase(), seen.get(tag.toLowerCase()) ?? tag)
  return [...seen.values()]
}

export const hasTag = (item: Tagged, tag: string | null) =>
  tag === null || item.tags.some((t) => t.toLowerCase() === tag.toLowerCase())

/**
 * The complete order of all notes after the visible ones (a filtered view) were rearranged: hidden notes stay
 * where they were, and the visible ones take the places the visible ones had, in their new order.
 */
export function orderWithHidden(
  all: readonly string[],
  visible: readonly string[],
  rearranged: readonly string[],
) {
  const shown = new Set(visible)
  let next = 0
  return all.map((id) => (shown.has(id) ? rearranged[next++]! : id))
}

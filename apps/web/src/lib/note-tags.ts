import { ref, watch, type Ref } from 'vue'

/** Anything that carries tags: a note, an article. */
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

/** Every tag used on these, once each (ignoring case, first spelling kept), in the order first met. */
export function tagsUsedOn(items: readonly Tagged[]): string[] {
  const seen = new Map<string, string>()
  for (const item of items)
    for (const tag of item.tags) seen.set(tag.toLowerCase(), seen.get(tag.toLowerCase()) ?? tag)
  return [...seen.values()]
}

/** Whether the item carries every one of these tags (ignoring case); no tags asked for means everything. */
const hasAllTags = (item: Tagged, tags: readonly string[]) =>
  tags.every((tag) => item.tags.some((t) => t.toLowerCase() === tag.toLowerCase()))

/** The chosen tags that something still carries: a tag nothing has any more can't be what is shown. */
const stillUsed = (chosen: readonly string[], used: readonly string[]) =>
  chosen.filter((c) => used.some((u) => u.toLowerCase() === c.toLowerCase()))

/**
 * The tags chosen to narrow a list, kept to tags something still carries (one nothing has any more can't be what is
 * shown). `matches` is whether an item has all of them.
 */
export function useTagFilter(usedTags: Ref<readonly string[]>) {
  const chosen = ref<string[]>([])
  watch(usedTags, (tags) => {
    const still = stillUsed(chosen.value, tags)
    if (still.length !== chosen.value.length) chosen.value = still
  })
  return { chosen, matches: (item: Tagged) => hasAllTags(item, chosen.value) }
}

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

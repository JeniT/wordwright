import { MAX_NOTE_TAGS } from '@lfwa/core'
import { fail } from '../errors'

/**
 * What one bulk tag change does to one thing's tags: the ones asked to go are taken off (ignoring case), then the ones
 * asked for are added if it doesn't have them, last. The order it already had is kept. `what` names the thing in the
 * refusal if it would end with more tags than it can hold ("A note", "A link").
 */
export function changeTags(
  current: readonly string[],
  add: readonly string[],
  remove: readonly string[],
  what: { kind: string; label: string },
): string[] {
  const gone = new Set(remove.map((t) => t.toLowerCase()))
  const next = current.filter((t) => !gone.has(t.toLowerCase()))
  const have = new Set(next.map((t) => t.toLowerCase()))
  for (const tag of add)
    if (!have.has(tag.toLowerCase()) && have.add(tag.toLowerCase())) next.push(tag)
  if (next.length > MAX_NOTE_TAGS) {
    const words = what.label.length > 40 ? `${what.label.slice(0, 40)}…` : what.label
    throw fail(
      409,
      `A ${what.kind} can have up to ${MAX_NOTE_TAGS} tags, and “${words}” would have ${next.length}. Take some tags off it, or add fewer.`,
    )
  }
  return next
}

export const sameTagList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((t, i) => t === b[i])

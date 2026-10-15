import type { IdeaLink, IdeaNote, NoteOrigin } from '@wordwright/core'

/** "Ada", "Ada and Bo", "Ada, Bo and Cy". */
export function nameList(names: readonly string[]): string {
  if (names.length < 2) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

/**
 * What a note is and where it came from, without saying who took it (that is shown as a name chip beside this).
 * "By <name>" is deliberately not used: it would read as the author of the piece being quoted.
 */
export function originPhrase(
  origin: NoteOrigin,
  source: { title: string; url: string; authors?: readonly string[] } | null,
  quote = false,
): string {
  if (origin === 'reading') {
    if (!source) return quote ? 'Quoted while reading' : 'From reading'
    const by = source.authors?.length ? `, by ${nameList(source.authors)}` : ''
    return `${quote ? 'Quoted from' : 'From reading'} “${source.title || source.url}”${by}`
  }
  return origin === 'brainstorm' ? 'From brainstorming' : 'Added'
}

/** A note's origin phrase. The item it was taken from may have been removed since; it still says reading. */
export function noteOriginPhrase(note: IdeaNote, readingList: readonly IdeaLink[]): string {
  const item = readingList.find((l) => l.id === note.readingItemId)
  return originPhrase(note.origin, item ?? null, note.quote)
}

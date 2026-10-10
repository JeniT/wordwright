import type { IdeaLink, IdeaNote, NoteOrigin } from '@lfwa/core'

/**
 * What a note is and where it came from, without saying who took it (that is shown as a name chip beside this).
 * "By <name>" is deliberately not used: it would read as the author of the piece being quoted.
 */
export function originPhrase(
  origin: NoteOrigin,
  source: { title: string; url: string } | null,
  quote = false,
): string {
  if (origin === 'reading') {
    if (!source) return quote ? 'Quoted while reading' : 'From reading'
    return `${quote ? 'Quoted from' : 'From reading'} “${source.title || source.url}”`
  }
  return origin === 'brainstorm' ? 'From brainstorming' : 'Added'
}

/** A note's origin phrase. The item it was taken from may have been removed since; it still says reading. */
export function noteOriginPhrase(note: IdeaNote, readingList: readonly IdeaLink[]): string {
  const item = readingList.find((l) => l.id === note.readingItemId)
  return originPhrase(note.origin, item ?? null, note.quote)
}

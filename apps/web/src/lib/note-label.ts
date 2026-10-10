import type { IdeaLink, IdeaNote, NoteOrigin } from '@lfwa/core'

/** The words for where something came from and who was there: this is a trusted space, so people are named. */
export function originWords(
  origin: NoteOrigin,
  authorName: string | null,
  source: { title: string; url: string } | null,
  quote = false,
): string {
  const who = authorName ?? 'a former member'
  if (origin === 'reading') {
    const what = quote ? 'Quoted while reading' : 'From reading'
    return source ? `${what} “${source.title || source.url}”, by ${who}` : `${what}, by ${who}`
  }
  return origin === 'brainstorm' ? `From brainstorming with ${who}` : `Added by ${who}`
}

/** A note's origin line. The item it was taken from may have been removed since; it still says reading. */
export function noteOriginLabel(note: IdeaNote, readingList: readonly IdeaLink[]): string {
  const item = readingList.find((l) => l.id === note.readingItemId)
  return originWords(note.origin, note.authorName, item ?? null, note.quote)
}

import type { IdeaLink, IdeaNote, NoteOrigin } from '@wordwright/core'

/** "Ada", "Ada and Bo", "Ada, Bo and Cy". */
export function nameList(names: readonly string[]): string {
  if (names.length < 2) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

/** The page a note was taken from, for the link in its origin line. */
export type OriginSource = { title: string; url: string }

/**
 * What a note is and where it came from, without saying who took it (that is shown as a name chip beside this).
 * A note from a page says only "From", and the page's title follows as a link (see `NoteOrigin`); whether it was a
 * quotation is shown by its quote mark, and the page's authors are on the page itself.
 */
export function originPhrase(origin: NoteOrigin, source: OriginSource | null): string {
  if (origin === 'reading') return source ? 'From' : 'From reading'
  return origin === 'brainstorm' ? 'From brainstorming' : 'Added'
}

/** What `NoteOrigin` shows for a note. The item it was taken from may have been removed since; it still says reading. */
export function noteOrigin(note: IdeaNote, readingList: readonly IdeaLink[]) {
  const item = readingList.find((l) => l.id === note.readingItemId)
  const source = note.origin === 'reading' && item ? item : null
  return { phrase: originPhrase(note.origin, source), source }
}

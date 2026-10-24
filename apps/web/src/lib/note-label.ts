import type { RouteLocationRaw } from 'vue-router'
import type { Article, IdeaNote, NoteOrigin } from '@wordwright/core'

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
 * quotation is shown by its quote mark, and the page's authors are on the page itself. A note from a conversation
 * says "From" too, followed by `conversationLabel`.
 */
export function originPhrase(origin: NoteOrigin, source: OriginSource | null): string {
  if (origin === 'reading') return source ? 'From' : 'From reading'
  return origin === 'brainstorm' ? 'From' : 'Added'
}

/** Whose AI a note's conversation was with: the viewer's, or someone else's. Null for a note not from one. */
export function conversationLabel(origin: NoteOrigin, ownConversation: boolean): string | null {
  return origin === 'brainstorm'
    ? `conversation with ${ownConversation ? 'your' : 'their'} AI`
    : null
}

/** Where a conversation can be read: the idea's Refine page. A note kept on the publication has no idea to go to. */
export function refineRoute(publicationId: string, ideaId: string | null | undefined) {
  return ideaId ? { name: 'brainstorm', params: { publicationId, id: ideaId } } : null
}

/**
 * What `NoteOrigin` shows for a note. The item it was taken from may have been removed since; it still says reading.
 * The conversation is the viewer's own when they are the note's author: whoever prompted the suggestion, or last
 * edited it. Nobody is "their" when the author has left.
 */
export function noteOrigin(
  note: IdeaNote,
  articleList: readonly Article[],
  viewerId: string | null,
  refineTo: RouteLocationRaw | null = null,
) {
  const item = articleList.find((l) => l.id === note.articleId)
  const source = note.origin === 'reading' && item ? item : null
  return {
    phrase: originPhrase(note.origin, source),
    source,
    conversation: conversationLabel(note.origin, viewerId !== null && note.authorId === viewerId),
    conversationTo: refineTo,
  }
}

import { notesToMarkdown, type Idea } from '@wordwright/core'
import type { Store } from '../db/store'

/** Keeps text we insert from closing or imitating the tags of what the AI is sent. */
export const escape = (text: string) => text.replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** One of the idea's notes as the AI is shown it. */
export interface SnapshotNote {
  text: string
  /** Someone else's exact words, kept word for word. */
  quote: boolean
  /** The title of the article it was taken from, if that is still on the list. */
  source: string | null
}

/** The idea's notes one by one, each with the title of the article it was taken from (if that is still there). */
export function snapshotNotes(store: Store, idea: Idea): SnapshotNote[] {
  const { notes, articles } = store
  return notes.list(idea.id).map((n) => ({
    text: n.text,
    quote: n.quote,
    source: (n.articleId && articles.get(idea.id, n.articleId)?.title) || null,
  }))
}

/**
 * The notes as bullets. A quotation says so, and where it is from, in front of its words, which are in quotation
 * marks: it is context, not something the writer thinks, and the AI must not take it as theirs. Shared by everything
 * that sends the AI the notes (the Refine snapshot, the research brief) so they mark it alike.
 * Null when no notes are given (the caller then falls back to the idea's notes as one text).
 */
export function notesText(notes: SnapshotNote[] | undefined): string | null {
  if (!notes) return null
  if (!notes.length) return '(none yet)'
  return escape(
    notesToMarkdown(
      notes.map((n) =>
        n.quote
          ? `[quotation${n.source ? ` from “${n.source}”` : ''}, not the writer’s own words] “${n.text.trim()}”`
          : // Only the app marks a quotation, so an ordinary note cannot start with the label and pass for one.
            n.text.replace(/^(\s*)\[(?=quotation)/i, '$1\\['),
      ),
    ),
  )
}

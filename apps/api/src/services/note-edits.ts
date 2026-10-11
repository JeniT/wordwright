import { HTTPException } from 'hono/http-exception'
import { MAX_IDEA_NOTES, MAX_NOTE_TAGS, NOTE_TEXT_MAX, type IdeaNote } from '@lfwa/core'
import type { Store } from '../db/store'
import { ownerOf, subjectOf, touch, type ListScope } from './scope'

const fail = (status: 400 | 404 | 409, message: string) => new HTTPException(status, { message })

/**
 * Joining notes and cutting one in two. Notes say where they came from (typed, brainstormed, taken from a
 * source) and some must stay as written (quotations), so only notes that agree on that can be merged, and
 * nothing that is already in a draft is changed under it. The rules are written out in docs/decisions.md.
 */
export class NoteEditService {
  constructor(private readonly store: Store) {}

  /** Merges the notes into the first of them (in the order they are arranged). Answers with all the notes of the idea or profile. */
  merge(scope: ListScope, userId: string, ids: string[]): IdeaNote[] {
    const { notes } = this.store
    const owner = ownerOf(scope)
    return this.store.transaction(() => {
      const wanted = new Set(ids)
      const all = notes.list(owner)
      const chosen = all.filter((n) => wanted.has(n.id)) // arranged order, not the order they were ticked
      if (chosen.length !== wanted.size) throw fail(404, 'Not found')
      if (chosen.length < 2) throw fail(400, 'Choose at least two notes to merge')

      if (chosen.some((n) => n.quote)) {
        throw fail(
          409,
          "Quotations can't be merged: they have to stay exactly as they were on the page.",
        )
      }
      if (chosen.some((n) => n.addedAt)) {
        throw fail(
          409,
          "A note that is already in a draft can't be merged. Put it back first, then merge it.",
        )
      }
      const first = chosen[0]!
      if (chosen.some((n) => n.origin !== first.origin)) {
        throw fail(
          409,
          "Notes that came from different places (typed by hand, brainstorming or reading) can't be merged, because a merged note can only say where it came from once.",
        )
      }
      if (chosen.some((n) => n.readingItemId !== first.readingItemId)) {
        throw fail(409, "Notes taken from different reading-list items can't be merged.")
      }

      const text = chosen.map((n) => n.text.trim()).join('\n\n')
      if (text.length > NOTE_TEXT_MAX) {
        throw fail(
          400,
          `The merged note would be longer than ${NOTE_TEXT_MAX.toLocaleString('en')} characters. Merge fewer notes.`,
        )
      }
      // Every tag from every note, once each (ignoring case), in the order they appear; the most a note can hold.
      const seen = new Set<string>()
      const tags = chosen
        .flatMap((n) => n.tags)
        .filter((t) => !seen.has(t.toLowerCase()) && !!seen.add(t.toLowerCase()))
        .slice(0, MAX_NOTE_TAGS)
      // Whose words they are: the author if they all had one, otherwise whoever joined them.
      const sameAuthor = chosen.every((n) => n.authorId === first.authorId)
      notes.merge(
        owner,
        first.id,
        chosen.slice(1).map((n) => n.id),
        { text, authorId: sameAuthor ? first.authorId : userId, tags },
      )
      touch(this.store, scope)
      return notes.list(owner)
    })
  }

  /** Cuts a note into two, the second just after the first. Answers with all the notes of the idea or profile. */
  split(scope: ListScope, noteId: string, before: string, after: string): IdeaNote[] {
    const { notes } = this.store
    const owner = ownerOf(scope)
    return this.store.transaction(() => {
      const note = notes.get(owner, noteId)
      if (!note) throw fail(404, 'Not found')
      if (note.quote) {
        throw fail(409, "A quotation can't be split: it has to stay exactly as it was on the page.")
      }
      if (note.addedAt) {
        throw fail(
          409,
          "A note that is already in a draft can't be split. Put it back first, then split it.",
        )
      }
      if (notes.count(owner) >= MAX_IDEA_NOTES) {
        throw fail(
          409,
          `${subjectOf(scope)} can have up to ${MAX_IDEA_NOTES} notes. Merge or delete some to make room.`,
        )
      }
      notes.split(scope.profileId, owner, note.id, before, after)
      touch(this.store, scope)
      return notes.list(owner)
    })
  }
}

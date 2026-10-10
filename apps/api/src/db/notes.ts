import { randomUUID } from 'node:crypto'
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite'
import type { IdeaNote, NoteOrigin } from '@lfwa/core'
import { nowIso } from './database'

type Row = Record<string, SQLOutputValue>

const toNote = (r: Row): IdeaNote => ({
  id: r.id as string,
  text: r.text as string,
  origin: r.origin as NoteOrigin,
  authorId: r.created_by as string | null,
  authorName: r.author_name as string | null,
  tags: [],
  readingItemId: r.reading_item_id as string | null,
  quote: r.is_quote === 1,
  addedAt: r.added_at as string | null,
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
})

/**
 * An idea's notes, in the order the person arranged them. Callers check that the person belongs to the
 * profile and that the idea is in it. `append`, `remove` and `reorder` make several writes, so routes call
 * them inside `store.transaction`.
 */
export class NoteStore {
  constructor(private readonly db: DatabaseSync) {}

  /** A note with its author's current name and its tags. */
  private select(where: string, ...args: string[]): IdeaNote[] {
    const notes = this.db
      .prepare(
        `SELECT n.*, u.name AS author_name FROM idea_notes n
         LEFT JOIN users u ON u.id = n.created_by WHERE ${where}`,
      )
      .all(...args)
      .map(toNote)
    if (!notes.length) return notes
    const byNote = new Map(notes.map((n) => [n.id, n]))
    const marks = notes.map(() => '?').join(', ')
    const rows = this.db
      .prepare(`SELECT note_id, tag FROM idea_note_tags WHERE note_id IN (${marks}) ORDER BY rowid`)
      .all(...notes.map((n) => n.id))
    for (const r of rows) byNote.get(r.note_id as string)?.tags.push(r.tag as string)
    return notes
  }

  /** Gives a note exactly these tags (already tidied and free of repeats). Call inside a transaction. */
  setTags(ideaId: string, id: string, tags: string[]): IdeaNote | undefined {
    if (!this.get(ideaId, id)) return undefined
    this.db.prepare('DELETE FROM idea_note_tags WHERE note_id = ?').run(id)
    const insert = this.db.prepare('INSERT INTO idea_note_tags (note_id, tag) VALUES (?, ?)')
    for (const tag of tags) insert.run(id, tag)
    this.db.prepare('UPDATE idea_notes SET updated_at = ? WHERE id = ?').run(nowIso(), id)
    return this.get(ideaId, id)
  }

  list(ideaId: string): IdeaNote[] {
    return this.select('n.idea_id = ? ORDER BY n.position, n.rowid', ideaId)
  }

  count(ideaId: string): number {
    return (
      this.db.prepare('SELECT count(*) AS n FROM idea_notes WHERE idea_id = ?').get(ideaId) as {
        n: number
      }
    ).n
  }

  /** Adds a note after the others. */
  append(
    profileId: string,
    ideaId: string,
    authorId: string | null,
    text: string,
    origin: NoteOrigin = 'entered',
    readingItemId: string | null = null,
    quote = false,
  ): IdeaNote {
    const id = randomUUID()
    const now = nowIso()
    this.db
      .prepare(
        `INSERT INTO idea_notes (id, profile_id, idea_id, created_by, text, origin, reading_item_id, is_quote, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, (SELECT coalesce(max(position) + 1, 0) FROM idea_notes WHERE idea_id = ?), ?, ?)`,
      )
      .run(
        id,
        profileId,
        ideaId,
        authorId,
        text,
        origin,
        readingItemId,
        quote ? 1 : 0,
        ideaId,
        now,
        now,
      )
    return this.select('n.id = ?', id)[0]!
  }

  /** Sets a note aside as used in a draft (keeping the first date), or puts it back. */
  setAdded(ideaId: string, id: string, added: boolean): IdeaNote | undefined {
    const now = nowIso()
    const changed =
      this.db
        .prepare(
          `UPDATE idea_notes SET added_at = CASE WHEN ? THEN coalesce(added_at, ?) ELSE NULL END
           WHERE idea_id = ? AND id = ?`,
        )
        .run(added ? 1 : 0, now, ideaId, id).changes > 0
    return changed ? this.select('n.id = ?', id)[0] : undefined
  }

  get(ideaId: string, id: string): IdeaNote | undefined {
    return this.select('n.idea_id = ? AND n.id = ?', ideaId, id)[0]
  }

  updateText(ideaId: string, id: string, text: string): IdeaNote | undefined {
    const changed =
      this.db
        .prepare('UPDATE idea_notes SET text = ?, updated_at = ? WHERE idea_id = ? AND id = ?')
        .run(text, nowIso(), ideaId, id).changes > 0
    if (!changed) return undefined
    return this.select('n.id = ?', id)[0]
  }

  remove(ideaId: string, id: string): boolean {
    const removed =
      this.db.prepare('DELETE FROM idea_notes WHERE idea_id = ? AND id = ?').run(ideaId, id)
        .changes > 0
    if (removed)
      this.renumber(
        ideaId,
        this.list(ideaId).map((n) => n.id),
      )
    return removed
  }

  /**
   * Puts the notes in the given order. Returns false, changing nothing, unless `ids` names exactly the
   * idea's current notes (so a stale screen can't silently drop or resurrect any).
   */
  reorder(ideaId: string, ids: string[]): boolean {
    const current = this.list(ideaId).map((n) => n.id)
    if (ids.length !== current.length || new Set(ids).size !== ids.length) return false
    const known = new Set(current)
    if (!ids.every((id) => known.has(id))) return false
    this.renumber(ideaId, ids)
    return true
  }

  /** Replaces every note with notes holding `texts`, in order (`entered` unless said otherwise). Transitional: see `Idea.notes`. */
  replaceAll(
    profileId: string,
    ideaId: string,
    authorId: string | null,
    texts: string[],
    origin: NoteOrigin = 'entered',
  ) {
    this.db.prepare('DELETE FROM idea_notes WHERE idea_id = ?').run(ideaId)
    for (const text of texts) this.append(profileId, ideaId, authorId, text, origin)
  }

  /**
   * Joins notes into the first of them: it takes the new text, author and tags, and the others are deleted. The
   * result is not "added" to any draft. Call inside a transaction; the rules about what may be merged are the
   * caller's.
   */
  merge(
    ideaId: string,
    keepId: string,
    dropIds: string[],
    merged: { text: string; authorId: string | null; tags: string[] },
  ) {
    this.db
      .prepare(
        'UPDATE idea_notes SET text = ?, created_by = ?, added_at = NULL, updated_at = ? WHERE idea_id = ? AND id = ?',
      )
      .run(merged.text, merged.authorId, nowIso(), ideaId, keepId)
    this.setTags(ideaId, keepId, merged.tags)
    const drop = this.db.prepare('DELETE FROM idea_notes WHERE idea_id = ? AND id = ?')
    for (const id of dropIds) drop.run(ideaId, id)
    this.renumber(
      ideaId,
      this.list(ideaId).map((n) => n.id),
    )
  }

  /**
   * Cuts a note in two: it keeps its place, identity and tags with the first part, and a copy (same origin,
   * author, source and tags) holding the second part follows it. Call inside a transaction.
   */
  split(profileId: string, ideaId: string, id: string, before: string, after: string): string {
    const note = this.get(ideaId, id)!
    const second = this.append(
      profileId,
      ideaId,
      note.authorId,
      after,
      note.origin,
      note.readingItemId,
    )
    this.setTags(ideaId, second.id, note.tags)
    this.updateText(ideaId, id, before)
    const ids = this.list(ideaId)
      .map((n) => n.id)
      .filter((n) => n !== second.id)
    ids.splice(ids.indexOf(id) + 1, 0, second.id)
    this.renumber(ideaId, ids)
    return second.id
  }

  private renumber(ideaId: string, ids: string[]) {
    const update = this.db.prepare(
      'UPDATE idea_notes SET position = ? WHERE idea_id = ? AND id = ?',
    )
    ids.forEach((id, position) => update.run(position, ideaId, id))
  }
}

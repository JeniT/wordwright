import { randomUUID } from 'node:crypto'
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite'
import type { IdeaNote, NoteOrigin } from '@wordwright/core'
import { nowIso } from './database'
import { owned, type Owner } from './owner'
import { renumber, reorder } from './ordering'

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
 * The notes of an idea, or of a publication as a whole (see `Owner`), in the order the person arranged them. Callers
 * check that the person belongs to the publication and that the idea is in it. `append`, `remove` and `reorder` make several writes, so routes call
 * them inside `store.transaction`.
 */
export class NoteStore {
  constructor(private readonly db: DatabaseSync) {}

  /** A note with its author's current name and its tags. */
  private select(where: string, ...args: string[]): IdeaNote[] {
    const notes = this.db
      .prepare(
        `SELECT n.*, COALESCE(u.name, n.kept_name) AS author_name FROM idea_notes n
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
  setTags(owner: Owner, id: string, tags: string[]): IdeaNote | undefined {
    if (!this.get(owner, id)) return undefined
    this.db.prepare('DELETE FROM idea_note_tags WHERE note_id = ?').run(id)
    const insert = this.db.prepare('INSERT INTO idea_note_tags (note_id, tag) VALUES (?, ?)')
    for (const tag of tags) insert.run(id, tag)
    this.db.prepare('UPDATE idea_notes SET updated_at = ? WHERE id = ?').run(nowIso(), id)
    return this.get(owner, id)
  }

  list(owner: Owner): IdeaNote[] {
    const w = owned(owner, 'n')
    return this.select(`${w.sql} ORDER BY n.position, n.rowid`, ...w.args)
  }

  count(owner: Owner): number {
    const w = owned(owner)
    return (
      this.db.prepare(`SELECT count(*) AS n FROM idea_notes WHERE ${w.sql}`).get(...w.args) as {
        n: number
      }
    ).n
  }

  /** The notes taken from a reading item, in their order. */
  byReadingItem(publicationId: string, readingItemId: string): string[] {
    return this.db
      .prepare(
        'SELECT id FROM idea_notes WHERE publication_id = ? AND reading_item_id = ? ORDER BY position, rowid',
      )
      .all(publicationId, readingItemId)
      .map((r) => r.id as string)
  }

  /** Where each of these notes is in the publication: the idea it belongs to, or null for the publication itself. */
  locate(publicationId: string, ids: string[]): Map<string, string | null> {
    if (!ids.length) return new Map()
    const marks = ids.map(() => '?').join(', ')
    const rows = this.db
      .prepare(`SELECT id, idea_id FROM idea_notes WHERE publication_id = ? AND id IN (${marks})`)
      .all(publicationId, ...ids)
    return new Map(rows.map((r) => [r.id as string, r.idea_id as string | null]))
  }

  /**
   * Hands a note of `publicationId` to an idea of `toPublicationId`, or to that publication (`null`), at the end of
   * that list, pointing at `readingItemId` there (or at no item). Clears "added", since it hasn't been put into any of
   * the new owner's drafts.
   */
  moveTo(
    publicationId: string,
    id: string,
    toPublicationId: string,
    ideaId: string | null,
    readingItemId: string | null,
  ) {
    const w = owned(ideaId ?? { publicationId: toPublicationId })
    this.db
      .prepare(
        `UPDATE idea_notes SET publication_id = ?, idea_id = ?, reading_item_id = ?, added_at = NULL, updated_at = ?,
           position = (SELECT coalesce(max(position) + 1, 0) FROM idea_notes WHERE ${w.sql})
         WHERE publication_id = ? AND id = ?`,
      )
      .run(toPublicationId, ideaId, readingItemId, nowIso(), ...w.args, publicationId, id)
  }

  /** Adds a note after the others. */
  append(
    publicationId: string,
    ideaId: string | null,
    authorId: string | null,
    text: string,
    origin: NoteOrigin = 'entered',
    readingItemId: string | null = null,
    quote = false,
  ): IdeaNote {
    const id = randomUUID()
    const now = nowIso()
    const w = owned(ideaId ?? { publicationId })
    this.db
      .prepare(
        `INSERT INTO idea_notes (id, publication_id, idea_id, created_by, text, origin, reading_item_id, is_quote, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, (SELECT coalesce(max(position) + 1, 0) FROM idea_notes WHERE ${w.sql}), ?, ?)`,
      )
      .run(
        id,
        publicationId,
        ideaId,
        authorId,
        text,
        origin,
        readingItemId,
        quote ? 1 : 0,
        ...w.args,
        now,
        now,
      )
    return this.select('n.id = ?', id)[0]!
  }

  /** Sets a note aside as used in a draft (keeping the first date), or puts it back. */
  setAdded(owner: Owner, id: string, added: boolean): IdeaNote | undefined {
    const now = nowIso()
    const w = owned(owner)
    const changed =
      this.db
        .prepare(
          `UPDATE idea_notes SET added_at = CASE WHEN ? THEN coalesce(added_at, ?) ELSE NULL END
           WHERE ${w.sql} AND id = ?`,
        )
        .run(added ? 1 : 0, now, ...w.args, id).changes > 0
    return changed ? this.select('n.id = ?', id)[0] : undefined
  }

  get(owner: Owner, id: string): IdeaNote | undefined {
    const w = owned(owner, 'n')
    return this.select(`${w.sql} AND n.id = ?`, ...w.args, id)[0]
  }

  updateText(owner: Owner, id: string, text: string): IdeaNote | undefined {
    const w = owned(owner)
    const changed =
      this.db
        .prepare(`UPDATE idea_notes SET text = ?, updated_at = ? WHERE ${w.sql} AND id = ?`)
        .run(text, nowIso(), ...w.args, id).changes > 0
    if (!changed) return undefined
    return this.select('n.id = ?', id)[0]
  }

  remove(owner: Owner, id: string): boolean {
    const w = owned(owner)
    const removed =
      this.db.prepare(`DELETE FROM idea_notes WHERE ${w.sql} AND id = ?`).run(...w.args, id)
        .changes > 0
    if (removed)
      this.renumber(
        owner,
        this.list(owner).map((n) => n.id),
      )
    return removed
  }

  /**
   * Puts the notes in the given order. Returns false, changing nothing, unless `ids` names exactly the
   * idea's current notes (so a stale screen can't silently drop or resurrect any).
   */
  reorder(owner: Owner, ids: string[]): boolean {
    const current = this.list(owner).map((n) => n.id)
    return reorder(this.db, 'idea_notes', owned(owner), current, ids)
  }

  /** Replaces every note with notes holding `texts`, in order (`entered` unless said otherwise). Transitional: see `Idea.notes`. */
  replaceAll(
    publicationId: string,
    ideaId: string,
    authorId: string | null,
    texts: string[],
    origin: NoteOrigin = 'entered',
  ) {
    this.db.prepare('DELETE FROM idea_notes WHERE idea_id = ?').run(ideaId)
    for (const text of texts) this.append(publicationId, ideaId, authorId, text, origin)
  }

  /**
   * Joins notes into the first of them: it takes the new text, author and tags, and the others are deleted. The
   * result is not "added" to any draft. Call inside a transaction; the rules about what may be merged are the
   * caller's.
   */
  merge(
    owner: Owner,
    keepId: string,
    dropIds: string[],
    merged: { text: string; authorId: string | null; tags: string[] },
  ) {
    const w = owned(owner)
    this.db
      .prepare(
        `UPDATE idea_notes SET text = ?, created_by = ?, added_at = NULL, updated_at = ? WHERE ${w.sql} AND id = ?`,
      )
      .run(merged.text, merged.authorId, nowIso(), ...w.args, keepId)
    this.setTags(owner, keepId, merged.tags)
    const drop = this.db.prepare(`DELETE FROM idea_notes WHERE ${w.sql} AND id = ?`)
    for (const id of dropIds) drop.run(...w.args, id)
    this.renumber(
      owner,
      this.list(owner).map((n) => n.id),
    )
  }

  /**
   * Cuts a note in two: it keeps its place, identity and tags with the first part, and a copy (same origin,
   * author, source and tags) holding the second part follows it. Call inside a transaction.
   */
  split(publicationId: string, owner: Owner, id: string, before: string, after: string): string {
    const ideaId = typeof owner === 'string' ? owner : null
    const note = this.get(owner, id)!
    const second = this.append(
      publicationId,
      ideaId,
      note.authorId,
      after,
      note.origin,
      note.readingItemId,
    )
    this.setTags(owner, second.id, note.tags)
    this.updateText(owner, id, before)
    const ids = this.list(owner)
      .map((n) => n.id)
      .filter((n) => n !== second.id)
    ids.splice(ids.indexOf(id) + 1, 0, second.id)
    this.renumber(owner, ids)
    return second.id
  }

  private renumber(owner: Owner, ids: string[]) {
    renumber(this.db, 'idea_notes', owned(owner), ids)
  }
}

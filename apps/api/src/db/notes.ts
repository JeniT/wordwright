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

  list(ideaId: string): IdeaNote[] {
    return this.db
      .prepare('SELECT * FROM idea_notes WHERE idea_id = ? ORDER BY position, rowid')
      .all(ideaId)
      .map(toNote)
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
  ): IdeaNote {
    const id = randomUUID()
    const now = nowIso()
    this.db
      .prepare(
        `INSERT INTO idea_notes (id, profile_id, idea_id, created_by, text, origin, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, (SELECT coalesce(max(position) + 1, 0) FROM idea_notes WHERE idea_id = ?), ?, ?)`,
      )
      .run(id, profileId, ideaId, authorId, text, origin, ideaId, now, now)
    return toNote(this.db.prepare('SELECT * FROM idea_notes WHERE id = ?').get(id)!)
  }

  updateText(ideaId: string, id: string, text: string): IdeaNote | undefined {
    const changed =
      this.db
        .prepare('UPDATE idea_notes SET text = ?, updated_at = ? WHERE idea_id = ? AND id = ?')
        .run(text, nowIso(), ideaId, id).changes > 0
    if (!changed) return undefined
    return toNote(this.db.prepare('SELECT * FROM idea_notes WHERE id = ?').get(id)!)
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

  private renumber(ideaId: string, ids: string[]) {
    const update = this.db.prepare(
      'UPDATE idea_notes SET position = ? WHERE idea_id = ? AND id = ?',
    )
    ids.forEach((id, position) => update.run(position, ideaId, id))
  }
}

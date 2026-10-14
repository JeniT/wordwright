import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { Draft, DraftInput, DraftInsertion, NoteOrigin } from '@lfwa/core'
import { nowIso } from './database'
import { parseNames } from './names'
import { reorder } from './ordering'

/** Drafts are always accessed through their profile; callers check membership first. Each develops an idea. */
export class DraftStore {
  constructor(private readonly db: DatabaseSync) {}

  list(profileId: string): Draft[] {
    return this.db
      .prepare(`${SELECT} WHERE d.profile_id = ? ORDER BY d.updated_at DESC`)
      .all(profileId)
      .map(toDraft)
  }

  get(profileId: string, id: string): Draft | undefined {
    const row = this.db.prepare(`${SELECT} WHERE d.profile_id = ? AND d.id = ?`).get(profileId, id)
    return row ? toDraft(row) : undefined
  }

  /** A draft by id alone, for callers that already know the person may reach it (a reviewer's own review). */
  getById(id: string): Draft | undefined {
    const row = this.db.prepare(`${SELECT} WHERE d.id = ?`).get(id)
    return row ? toDraft(row) : undefined
  }

  create(profileId: string, createdBy: string, input: DraftInput, ideaId: string): Draft {
    const id = randomUUID()
    const now = nowIso()
    this.db
      .prepare(
        `INSERT INTO drafts (id, profile_id, idea_id, created_by, editor_id, title, body, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?,
                 (SELECT coalesce(max(position) + 1, 0) FROM drafts WHERE idea_id = ?), ?, ?)`,
      )
      .run(id, profileId, ideaId, createdBy, createdBy, input.title, input.body, ideaId, now, now)
    return this.get(profileId, id)!
  }

  /**
   * Saves the words if `version` is still the draft's current one. Undefined means nothing was saved: the draft
   * is missing or has been saved since (the caller tells which by looking it up).
   */
  update(profileId: string, id: string, input: DraftInput, version: number): Draft | undefined {
    const result = this.db
      .prepare(
        `UPDATE drafts SET title = ?, body = ?, version = version + 1, updated_at = ?
         WHERE profile_id = ? AND id = ? AND version = ?`,
      )
      .run(input.title, input.body, nowIso(), profileId, id, version)
    return result.changes ? this.get(profileId, id) : undefined
  }

  /** The drafts in the profile that this person is editor of. */
  editedBy(profileId: string, userId: string): string[] {
    return (
      this.db
        .prepare(
          'SELECT id FROM drafts WHERE profile_id = ? AND editor_id = ? ORDER BY position, id',
        )
        .all(profileId, userId) as { id: string }[]
    ).map((r) => r.id)
  }

  /** Makes `userId` the editor of this one draft. */
  setEditor(id: string, userId: string) {
    this.db.prepare('UPDATE drafts SET editor_id = ? WHERE id = ?').run(userId, id)
  }

  /** Makes `toUserId` the editor of every draft in the profile that `fromUserId` is editor of. */
  reassignEditor(profileId: string, fromUserId: string, toUserId: string) {
    this.db
      .prepare('UPDATE drafts SET editor_id = ? WHERE profile_id = ? AND editor_id = ?')
      .run(toUserId, profileId, fromUserId)
  }

  /** What was pulled into a draft from notes, oldest first. */
  insertions(draftId: string): DraftInsertion[] {
    return this.db
      .prepare(
        `SELECT i.*, COALESCE(na.name, i.kept_note_author_name) AS note_author_name,
                COALESCE(ib.name, i.kept_inserted_by_name) AS inserted_by_name
         FROM draft_insertions i
         LEFT JOIN users na ON na.id = i.note_author_id
         LEFT JOIN users ib ON ib.id = i.inserted_by
         WHERE i.draft_id = ? ORDER BY i.inserted_at, i.rowid`,
      )
      .all(draftId)
      .map((r) => ({
        id: r.id as string,
        text: r.text as string,
        origin: r.origin as NoteOrigin,
        noteAuthorName: r.note_author_name as string | null,
        insertedByName: r.inserted_by_name as string | null,
        insertedAt: r.inserted_at as string,
        source: r.source_url
          ? {
              title: r.source_title as string,
              url: r.source_url as string,
              authors: parseNames(r.source_authors),
            }
          : null,
      }))
  }

  addInsertion(
    draftId: string,
    i: {
      noteId: string
      noteAuthorId: string | null
      insertedBy: string
      text: string
      origin: NoteOrigin
      source: { title: string; url: string; authors: string[] } | null
    },
  ): string {
    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO draft_insertions (id, draft_id, note_id, note_author_id, inserted_by, text, origin,
           source_title, source_url, source_authors, inserted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        draftId,
        i.noteId,
        i.noteAuthorId,
        i.insertedBy,
        i.text,
        i.origin,
        i.source?.title ?? null,
        i.source?.url ?? null,
        i.source ? JSON.stringify(i.source.authors) : null,
        nowIso(),
      )
    return id
  }

  /**
   * Puts an idea's drafts in the given order. Returns false, changing nothing, unless `ids` names
   * exactly the idea's current drafts (so a stale screen can't silently drop or resurrect any).
   * Call inside a transaction: it makes several writes.
   */
  reorder(ideaId: string, ids: string[]): boolean {
    const current = (
      this.db.prepare('SELECT id FROM drafts WHERE idea_id = ?').all(ideaId) as { id: string }[]
    ).map((row) => row.id)
    return reorder(this.db, 'drafts', { sql: 'idea_id = ?', args: [ideaId] }, current, ids)
  }

  delete(profileId: string, id: string): boolean {
    return (
      this.db.prepare('DELETE FROM drafts WHERE profile_id = ? AND id = ?').run(profileId, id)
        .changes > 0
    )
  }
}

const SELECT = `SELECT d.*, u.name AS editor_name FROM drafts d LEFT JOIN users u ON u.id = d.editor_id`

function toDraft(row: Record<string, unknown>): Draft {
  return {
    id: row.id as string,
    profileId: row.profile_id as string,
    ideaId: row.idea_id as string,
    title: row.title as string,
    body: row.body as string,
    editorId: row.editor_id as string,
    editorName: row.editor_name as string,
    version: row.version as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

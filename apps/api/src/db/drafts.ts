import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type {
  ActiveDraft,
  Draft,
  DraftInput,
  DraftInsertion,
  InsertionOrigin,
  NoteOrigin,
  OptionUseInput,
} from '@wordwright/core'
import { nowIso } from './database'
import { parseNames } from './names'
import { reorder } from './ordering'

/** A draft the person edits, with where it lives (no review figures yet). */
export type EditedDraft = Omit<ActiveDraft, 'review'>

/** Drafts are always accessed through their publication; callers check membership first. Each develops an idea. */
export class DraftStore {
  constructor(private readonly db: DatabaseSync) {}

  list(publicationId: string): Draft[] {
    return this.db
      .prepare(`${SELECT} WHERE d.publication_id = ? ORDER BY d.updated_at DESC`)
      .all(publicationId)
      .map(toDraft)
  }

  /**
   * The drafts `userId` edits, in publications they still belong to, most recently saved first; optionally only those
   * of one publication or one idea. The caller decides which of them are active.
   */
  editedByAnywhere(
    userId: string,
    within: { publicationId?: string; ideaId?: string } = {},
  ): EditedDraft[] {
    return this.db
      .prepare(
        `SELECT d.id, d.title, d.idea_id, d.publication_id, d.updated_at, i.name AS idea_name, p.name AS publication_name
         FROM drafts d
         JOIN publication_members m ON m.publication_id = d.publication_id AND m.user_id = ?
         JOIN ideas i ON i.id = d.idea_id
         JOIN publications p ON p.id = d.publication_id
         WHERE d.editor_id = ?
           AND (? IS NULL OR d.publication_id = ?)
           AND (? IS NULL OR d.idea_id = ?)
         ORDER BY d.updated_at DESC, d.rowid DESC`,
      )
      .all(
        userId,
        userId,
        within.publicationId ?? null,
        within.publicationId ?? null,
        within.ideaId ?? null,
        within.ideaId ?? null,
      )
      .map((row) => ({
        id: row.id as string,
        title: row.title as string,
        ideaId: row.idea_id as string,
        ideaName: row.idea_name as string,
        publicationId: row.publication_id as string,
        publicationName: row.publication_name as string,
        updatedAt: row.updated_at as string,
      }))
  }

  get(publicationId: string, id: string): Draft | undefined {
    const row = this.db
      .prepare(`${SELECT} WHERE d.publication_id = ? AND d.id = ?`)
      .get(publicationId, id)
    return row ? toDraft(row) : undefined
  }

  /** A draft by id alone, for callers that already know the person may reach it (a reviewer's own review). */
  getById(id: string): Draft | undefined {
    const row = this.db.prepare(`${SELECT} WHERE d.id = ?`).get(id)
    return row ? toDraft(row) : undefined
  }

  create(publicationId: string, createdBy: string, input: DraftInput, ideaId: string): Draft {
    const id = randomUUID()
    const now = nowIso()
    this.db
      .prepare(
        `INSERT INTO drafts (id, publication_id, idea_id, created_by, editor_id, title, body, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?,
                 (SELECT coalesce(max(position) + 1, 0) FROM drafts WHERE idea_id = ?), ?, ?)`,
      )
      .run(
        id,
        publicationId,
        ideaId,
        createdBy,
        createdBy,
        input.title,
        input.body,
        ideaId,
        now,
        now,
      )
    return this.get(publicationId, id)!
  }

  /**
   * Saves the words if `version` is still the draft's current one. Undefined means nothing was saved: the draft
   * is missing or has been saved since (the caller tells which by looking it up).
   */
  update(publicationId: string, id: string, input: DraftInput, version: number): Draft | undefined {
    const result = this.db
      .prepare(
        `UPDATE drafts SET title = ?, body = ?, version = version + 1, updated_at = ?
         WHERE publication_id = ? AND id = ? AND version = ?`,
      )
      .run(input.title, input.body, nowIso(), publicationId, id, version)
    return result.changes ? this.get(publicationId, id) : undefined
  }

  /** The drafts in the publication that this person is editor of. */
  editedBy(publicationId: string, userId: string): string[] {
    return (
      this.db
        .prepare(
          'SELECT id FROM drafts WHERE publication_id = ? AND editor_id = ? ORDER BY position, id',
        )
        .all(publicationId, userId) as { id: string }[]
    ).map((r) => r.id)
  }

  /** The drafts in the publication that this person started, whoever edits them now. */
  startedBy(publicationId: string, userId: string): string[] {
    return (
      this.db
        .prepare(
          'SELECT id FROM drafts WHERE publication_id = ? AND created_by = ? ORDER BY position, id',
        )
        .all(publicationId, userId) as { id: string }[]
    ).map((r) => r.id)
  }

  /** Makes `userId` the editor of this one draft. */
  setEditor(id: string, userId: string) {
    this.db.prepare('UPDATE drafts SET editor_id = ? WHERE id = ?').run(userId, id)
  }

  /** Makes `toUserId` the editor of every draft in the publication that `fromUserId` is editor of. */
  reassignEditor(publicationId: string, fromUserId: string, toUserId: string) {
    this.db
      .prepare('UPDATE drafts SET editor_id = ? WHERE publication_id = ? AND editor_id = ?')
      .run(toUserId, publicationId, fromUserId)
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
        origin: r.origin as InsertionOrigin,
        ...(r.origin === 'option'
          ? {
              option: {
                kind: r.option_kind as 'title' | 'passage',
                offered: r.option_offered as string,
                aim: r.option_aim as string,
              },
            }
          : {}),
        noteAuthorId: (r.note_author_id as string | null) ?? null,
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

  /** Records that words in the draft began as an AI option (Rephrase), by whom, and what was offered. */
  addOptionInsertion(draftId: string, insertedBy: string, i: OptionUseInput): string {
    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO draft_insertions (id, draft_id, inserted_by, text, origin, option_kind, option_offered,
           option_aim, inserted_at) VALUES (?, ?, ?, ?, 'option', ?, ?, ?, ?)`,
      )
      .run(id, draftId, insertedBy, i.text, i.kind, i.offered, i.aim, nowIso())
    return id
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

  delete(publicationId: string, id: string): boolean {
    return (
      this.db
        .prepare('DELETE FROM drafts WHERE publication_id = ? AND id = ?')
        .run(publicationId, id).changes > 0
    )
  }
}

const SELECT = `SELECT d.*, u.name AS editor_name FROM drafts d LEFT JOIN users u ON u.id = d.editor_id`

function toDraft(row: Record<string, unknown>): Draft {
  return {
    id: row.id as string,
    publicationId: row.publication_id as string,
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

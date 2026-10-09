import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { Draft, DraftInput } from '@lfwa/core'
import { nowIso } from './database'

/**
 * Drafts are always accessed through their profile; callers check membership first. A draft may
 * develop an idea (`idea_id`); drafts that don't are "standalone", and are what `list` returns.
 */
export class DraftStore {
  constructor(private readonly db: DatabaseSync) {}

  /** Standalone drafts only; an idea's drafts are listed with the idea. */
  list(profileId: string): Draft[] {
    return this.db
      .prepare(
        'SELECT * FROM drafts WHERE profile_id = ? AND idea_id IS NULL ORDER BY updated_at DESC',
      )
      .all(profileId)
      .map(toDraft)
  }

  get(profileId: string, id: string): Draft | undefined {
    const row = this.db
      .prepare('SELECT * FROM drafts WHERE profile_id = ? AND id = ?')
      .get(profileId, id)
    return row ? toDraft(row) : undefined
  }

  create(
    profileId: string,
    createdBy: string,
    input: DraftInput,
    ideaId: string | null = null,
  ): Draft {
    const id = randomUUID()
    const now = nowIso()
    this.db
      .prepare(
        `INSERT INTO drafts (id, profile_id, idea_id, created_by, title, body, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, profileId, ideaId, createdBy, input.title, input.body, now, now)
    return this.get(profileId, id)!
  }

  update(profileId: string, id: string, input: DraftInput): Draft | undefined {
    const result = this.db
      .prepare(
        'UPDATE drafts SET title = ?, body = ?, updated_at = ? WHERE profile_id = ? AND id = ?',
      )
      .run(input.title, input.body, nowIso(), profileId, id)
    return result.changes ? this.get(profileId, id) : undefined
  }

  delete(profileId: string, id: string): boolean {
    return (
      this.db.prepare('DELETE FROM drafts WHERE profile_id = ? AND id = ?').run(profileId, id)
        .changes > 0
    )
  }
}

function toDraft(row: Record<string, unknown>): Draft {
  return {
    id: row.id as string,
    profileId: row.profile_id as string,
    ideaId: (row.idea_id as string | null) ?? null,
    title: row.title as string,
    body: row.body as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

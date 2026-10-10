import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { Draft, DraftInput } from '@lfwa/core'
import { nowIso } from './database'

/** Drafts are always accessed through their profile; callers check membership first. Each develops an idea. */
export class DraftStore {
  constructor(private readonly db: DatabaseSync) {}

  list(profileId: string): Draft[] {
    return this.db
      .prepare('SELECT * FROM drafts WHERE profile_id = ? ORDER BY updated_at DESC')
      .all(profileId)
      .map(toDraft)
  }

  get(profileId: string, id: string): Draft | undefined {
    const row = this.db
      .prepare('SELECT * FROM drafts WHERE profile_id = ? AND id = ?')
      .get(profileId, id)
    return row ? toDraft(row) : undefined
  }

  create(profileId: string, createdBy: string, input: DraftInput, ideaId: string): Draft {
    const id = randomUUID()
    const now = nowIso()
    this.db
      .prepare(
        `INSERT INTO drafts (id, profile_id, idea_id, created_by, title, body, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?,
                 (SELECT coalesce(max(position) + 1, 0) FROM drafts WHERE idea_id = ?), ?, ?)`,
      )
      .run(id, profileId, ideaId, createdBy, input.title, input.body, ideaId, now, now)
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

  /**
   * Puts an idea's drafts in the given order. Returns false, changing nothing, unless `ids` names
   * exactly the idea's current drafts (so a stale screen can't silently drop or resurrect any).
   * Call inside a transaction: it makes several writes.
   */
  reorder(ideaId: string, ids: string[]): boolean {
    const current = (
      this.db.prepare('SELECT id FROM drafts WHERE idea_id = ?').all(ideaId) as { id: string }[]
    ).map((row) => row.id)
    if (ids.length !== current.length || new Set(ids).size !== ids.length) return false
    const known = new Set(current)
    if (!ids.every((id) => known.has(id))) return false
    const update = this.db.prepare('UPDATE drafts SET position = ? WHERE idea_id = ? AND id = ?')
    ids.forEach((id, position) => update.run(position, ideaId, id))
    return true
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
    ideaId: row.idea_id as string,
    title: row.title as string,
    body: row.body as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

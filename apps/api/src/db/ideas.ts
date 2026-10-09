import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { Idea, IdeaInput, IdeaLink, IdeaLinkInput, IdeaSummary, IdeaUpdate } from '@lfwa/core'
import { nowIso } from './database'

/** Ideas are always accessed through their profile; callers check membership first. */
export class IdeaStore {
  constructor(private readonly db: DatabaseSync) {}

  list(profileId: string): IdeaSummary[] {
    return this.db
      .prepare(
        `SELECT i.id, i.name, i.updated_at,
           (SELECT count(*) FROM drafts d WHERE d.idea_id = i.id) AS draft_count
         FROM ideas i WHERE i.profile_id = ? ORDER BY i.updated_at DESC, i.rowid DESC`,
      )
      .all(profileId)
      .map((row) => ({
        id: row.id as string,
        name: row.name as string,
        draftCount: row.draft_count as number,
        updatedAt: row.updated_at as string,
      }))
  }

  get(profileId: string, id: string): Idea | undefined {
    const row = this.db
      .prepare('SELECT * FROM ideas WHERE profile_id = ? AND id = ?')
      .get(profileId, id)
    if (!row) return undefined
    const links = this.db
      .prepare('SELECT id, url, title FROM idea_links WHERE idea_id = ? ORDER BY created_at, rowid')
      .all(id)
      .map((l) => ({ id: l.id as string, url: l.url as string, title: l.title as string }))
    const drafts = this.db
      .prepare(
        'SELECT id, title, updated_at FROM drafts WHERE idea_id = ? ORDER BY created_at, rowid',
      )
      .all(id)
      .map((d) => ({
        id: d.id as string,
        title: d.title as string,
        updatedAt: d.updated_at as string,
      }))
    return {
      id,
      profileId: row.profile_id as string,
      name: row.name as string,
      notes: row.notes as string,
      links,
      drafts,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    }
  }

  create(profileId: string, createdBy: string, input: IdeaInput): Idea {
    const id = randomUUID()
    const now = nowIso()
    this.db
      .prepare(
        `INSERT INTO ideas (id, profile_id, created_by, name, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, profileId, createdBy, input.name, input.notes, now, now)
    return this.get(profileId, id)!
  }

  update(profileId: string, id: string, changes: IdeaUpdate): Idea | undefined {
    const current = this.get(profileId, id)
    if (!current) return undefined
    this.db
      .prepare('UPDATE ideas SET name = ?, notes = ?, updated_at = ? WHERE id = ?')
      .run(changes.name ?? current.name, changes.notes ?? current.notes, nowIso(), id)
    return this.get(profileId, id)
  }

  /** Deletes the idea along with its links and the drafts that develop it. */
  delete(profileId: string, id: string): boolean {
    return (
      this.db.prepare('DELETE FROM ideas WHERE profile_id = ? AND id = ?').run(profileId, id)
        .changes > 0
    )
  }

  countLinks(ideaId: string): number {
    return (
      this.db.prepare('SELECT count(*) AS n FROM idea_links WHERE idea_id = ?').get(ideaId) as {
        n: number
      }
    ).n
  }

  addLink(ideaId: string, input: IdeaLinkInput): IdeaLink {
    const id = randomUUID()
    const now = nowIso()
    this.db
      .prepare(
        'INSERT INTO idea_links (id, idea_id, url, title, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(id, ideaId, input.url, input.title, now)
    this.touch(ideaId, now)
    return { id, url: input.url, title: input.title }
  }

  removeLink(ideaId: string, linkId: string): boolean {
    const removed =
      this.db.prepare('DELETE FROM idea_links WHERE idea_id = ? AND id = ?').run(ideaId, linkId)
        .changes > 0
    if (removed) this.touch(ideaId)
    return removed
  }

  touch(id: string, now = nowIso()) {
    this.db.prepare('UPDATE ideas SET updated_at = ? WHERE id = ?').run(now, id)
  }
}

import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { markdownToNotes, notesToMarkdown } from '@lfwa/core'
import type { Idea, IdeaInput, IdeaLink, IdeaLinkInput, IdeaSummary, IdeaUpdate } from '@lfwa/core'
import { nowIso } from './database'
import { NoteStore } from './notes'

/** Ideas are always accessed through their profile; callers check membership first. */
export class IdeaStore {
  private readonly notes: NoteStore

  constructor(private readonly db: DatabaseSync) {
    this.notes = new NoteStore(db)
  }

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
        'SELECT id, title, updated_at FROM drafts WHERE idea_id = ? ORDER BY position, created_at, rowid',
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
      // Transitional: see `Idea.notes`. The column of the same name is no longer read.
      notes: notesToMarkdown(this.notes.list(id).map((n) => n.text)),
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
      .run(id, profileId, createdBy, input.name, '', now, now)
    this.notes.replaceAll(profileId, id, createdBy, markdownToNotes(input.notes))
    return this.get(profileId, id)!
  }

  update(profileId: string, id: string, changes: IdeaUpdate): Idea | undefined {
    const current = this.get(profileId, id)
    if (!current) return undefined
    this.db
      .prepare('UPDATE ideas SET name = ?, updated_at = ? WHERE id = ?')
      .run(changes.name ?? current.name, nowIso(), id)
    // Text that reads the same as the current notes must not replace them (and lose their ids and origins).
    if (changes.notes !== undefined) {
      const texts = markdownToNotes(changes.notes)
      const same = this.notes.list(id).map((n) => n.text)
      if (texts.length !== same.length || texts.some((t, i) => t !== same[i]))
        this.notes.replaceAll(profileId, id, null, texts)
    }
    return this.get(profileId, id)
  }

  /** Deletes the idea along with its links, notes and the drafts that develop it. */
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

  updateLink(ideaId: string, linkId: string, input: IdeaLinkInput): boolean {
    const changed =
      this.db
        .prepare('UPDATE idea_links SET url = ?, title = ? WHERE idea_id = ? AND id = ?')
        .run(input.url, input.title, ideaId, linkId).changes > 0
    if (changed) this.touch(ideaId)
    return changed
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

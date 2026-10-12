import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { markdownToNotes, notesToMarkdown } from '@lfwa/core'
import type {
  Idea,
  IdeaInput,
  IdeaLink,
  IdeaSummary,
  IdeaUpdate,
  NoteOrigin,
  ReadingOrigin,
} from '@lfwa/core'
import { nowIso } from './database'
import { NoteStore } from './notes'
import { ReadingStore, type LinkWrite } from './reading'

export type { LinkWrite }

/** Ideas are always accessed through their profile; callers check membership first. */
export class IdeaStore {
  private readonly notes: NoteStore
  private readonly reading: ReadingStore

  constructor(private readonly db: DatabaseSync) {
    this.notes = new NoteStore(db)
    this.reading = new ReadingStore(db)
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
    const links = this.reading.list(id)
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

  /** `origin` is where the starting notes came from. */
  create(
    profileId: string,
    createdBy: string,
    input: IdeaInput,
    origin: NoteOrigin = 'entered',
  ): Idea {
    const id = randomUUID()
    const now = nowIso()
    this.db
      .prepare(
        `INSERT INTO ideas (id, profile_id, created_by, name, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, profileId, createdBy, input.name, '', now, now)
    this.notes.replaceAll(profileId, id, createdBy, markdownToNotes(input.notes), origin)
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
    return this.reading.count(ideaId)
  }

  /** Adds an item to the reading list; `origin` says what put it there (the writer, unless a feature did). */
  addLink(
    ideaId: string,
    input: Omit<LinkWrite, 'authors'> & { authors?: string[]; why?: string },
    origin: ReadingOrigin = 'entered',
  ): IdeaLink {
    const profileId = (
      this.db.prepare('SELECT profile_id FROM ideas WHERE id = ?').get(ideaId) as {
        profile_id: string
      }
    ).profile_id
    const link = this.reading.add(profileId, ideaId, input, origin)
    this.touch(ideaId)
    return link
  }

  /** Marks an item read (when the writer says so) or unread again. Marking read again keeps the first date. */
  setLinkRead(ideaId: string, linkId: string, read: boolean): boolean {
    const changed = this.reading.setRead(ideaId, linkId, read)
    if (changed) this.touch(ideaId)
    return changed
  }

  /** Gives an item exactly these tags. */
  setLinkTags(ideaId: string, linkId: string, tags: string[]): boolean {
    const saved = this.reading.setTags(ideaId, linkId, tags)
    if (saved) this.touch(ideaId)
    return !!saved
  }

  updateLink(ideaId: string, linkId: string, input: LinkWrite): boolean {
    const changed = this.reading.update(ideaId, linkId, input)
    if (changed) this.touch(ideaId)
    return changed
  }

  removeLink(ideaId: string, linkId: string): boolean {
    const removed = this.reading.remove(ideaId, linkId)
    if (removed) this.touch(ideaId)
    return removed
  }

  touch(id: string, now = nowIso()) {
    this.db.prepare('UPDATE ideas SET updated_at = ? WHERE id = ?').run(now, id)
  }
}

import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { markdownToNotes, notesToMarkdown } from '@wordwright/core'
import type {
  Idea,
  IdeaInput,
  IdeaLink,
  IdeaSummary,
  IdeaUpdate,
  NoteOrigin,
  ReadingOrigin,
} from '@wordwright/core'
import { nowIso } from './database'
import { NoteStore } from './notes'
import { ReadingStore, type LinkWrite } from './reading'

export type { LinkWrite }

/** Ideas are always accessed through their publication; callers check membership first. */
export class IdeaStore {
  private readonly notes: NoteStore
  private readonly reading: ReadingStore

  constructor(private readonly db: DatabaseSync) {
    this.notes = new NoteStore(db)
    this.reading = new ReadingStore(db)
  }

  list(publicationId: string): IdeaSummary[] {
    return this.db
      .prepare(
        `SELECT i.id, i.name, i.updated_at,
           (SELECT count(*) FROM drafts d WHERE d.idea_id = i.id) AS draft_count
         FROM ideas i WHERE i.publication_id = ? ORDER BY i.updated_at DESC, i.rowid DESC`,
      )
      .all(publicationId)
      .map((row) => ({
        id: row.id as string,
        name: row.name as string,
        draftCount: row.draft_count as number,
        updatedAt: row.updated_at as string,
      }))
  }

  get(publicationId: string, id: string): Idea | undefined {
    const row = this.db
      .prepare('SELECT * FROM ideas WHERE publication_id = ? AND id = ?')
      .get(publicationId, id)
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
      publicationId: row.publication_id as string,
      name: row.name as string,
      // Transitional: see `Idea.notes`. It is assembled from the notes table; ideas has no such column.
      notes: notesToMarkdown(this.notes.list(id).map((n) => n.text)),
      links,
      drafts,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    }
  }

  /** `origin` is where the starting notes came from. */
  create(
    publicationId: string,
    createdBy: string,
    input: IdeaInput,
    origin: NoteOrigin = 'entered',
  ): Idea {
    const id = randomUUID()
    const now = nowIso()
    this.db
      .prepare(
        `INSERT INTO ideas (id, publication_id, created_by, name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, publicationId, createdBy, input.name, now, now)
    this.notes.replaceAll(publicationId, id, createdBy, markdownToNotes(input.notes), origin)
    return this.get(publicationId, id)!
  }

  update(publicationId: string, id: string, changes: IdeaUpdate): Idea | undefined {
    const current = this.get(publicationId, id)
    if (!current) return undefined
    this.db
      .prepare('UPDATE ideas SET name = ?, updated_at = ? WHERE id = ?')
      .run(changes.name ?? current.name, nowIso(), id)
    // Text that reads the same as the current notes must not replace them (and lose their ids and origins).
    if (changes.notes !== undefined) {
      const texts = markdownToNotes(changes.notes)
      const same = this.notes.list(id).map((n) => n.text)
      if (texts.length !== same.length || texts.some((t, i) => t !== same[i]))
        this.notes.replaceAll(publicationId, id, null, texts)
    }
    return this.get(publicationId, id)
  }

  /** Deletes the idea along with its links, notes and the drafts that develop it. */
  delete(publicationId: string, id: string): boolean {
    return (
      this.db
        .prepare('DELETE FROM ideas WHERE publication_id = ? AND id = ?')
        .run(publicationId, id).changes > 0
    )
  }

  /** What an idea holds, for saying what moving it takes with it. */
  contents(id: string): { drafts: number; notes: number; links: number } {
    const n = (table: string) =>
      (
        this.db.prepare(`SELECT count(*) AS n FROM ${table} WHERE idea_id = ?`).get(id) as {
          n: number
        }
      ).n
    return { drafts: n('drafts'), notes: n('idea_notes'), links: n('idea_links') }
  }

  /**
   * Hands the idea, with its drafts, notes and links, to another publication. Everything that hangs off the idea or a
   * draft (comments, reviews, critique rounds, the brainstorm thread, research) follows by their ids. A reading item
   * stops coming from a feed, since feeds belong to the publication they were added to.
   */
  moveToPublication(id: string, toPublicationId: string) {
    const now = nowIso()
    this.db
      .prepare('UPDATE ideas SET publication_id = ?, updated_at = ? WHERE id = ?')
      .run(toPublicationId, now, id)
    for (const table of ['drafts', 'idea_notes']) {
      this.db
        .prepare(`UPDATE ${table} SET publication_id = ? WHERE idea_id = ?`)
        .run(toPublicationId, id)
    }
    this.db
      .prepare('UPDATE idea_links SET publication_id = ?, source_id = NULL WHERE idea_id = ?')
      .run(toPublicationId, id)
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
    const publicationId = (
      this.db.prepare('SELECT publication_id FROM ideas WHERE id = ?').get(ideaId) as {
        publication_id: string
      }
    ).publication_id
    const link = this.reading.add(publicationId, ideaId, input, origin)
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

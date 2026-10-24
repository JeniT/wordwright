import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { markdownToNotes, notesToMarkdown } from '@wordwright/core'
import type {
  Idea,
  IdeaInput,
  Article,
  IdeaSummary,
  IdeaUpdate,
  NoteOrigin,
  ArticleOrigin,
} from '@wordwright/core'
import { nowIso } from './database'
import { NoteStore } from './notes'
import { ArticleStore, type ArticleWrite } from './articles'

export type { ArticleWrite }

/** Ideas are always accessed through their publication; callers check membership first. */
export class IdeaStore {
  private readonly notes: NoteStore
  private readonly articles: ArticleStore

  constructor(private readonly db: DatabaseSync) {
    this.notes = new NoteStore(db)
    this.articles = new ArticleStore(db)
  }

  list(publicationId: string): IdeaSummary[] {
    return this.db
      .prepare(
        `SELECT i.id, i.name, i.updated_at,
           (SELECT count(*) FROM drafts d WHERE d.idea_id = i.id AND d.published_at IS NULL) AS draft_count
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
    const articles = this.articles.list(id)
    const drafts = this.db
      .prepare(
        `SELECT d.id, d.title, d.updated_at, d.editor_id, u.name AS editor_name, d.published_at, d.published_url
         FROM drafts d LEFT JOIN users u ON u.id = d.editor_id
         WHERE d.idea_id = ? ORDER BY d.position, d.created_at, d.rowid`,
      )
      .all(id)
      .map((d) => ({
        id: d.id as string,
        title: d.title as string,
        updatedAt: d.updated_at as string,
        editorId: d.editor_id as string,
        // Only a guard: removing an account hands its drafts to an owner first, so an editor is never missing.
        editorName: (d.editor_name as string | null) ?? 'A former member',
        publishedAt: (d.published_at as string | null) ?? null,
        publishedUrl: (d.published_url as string | null) ?? null,
      }))
    const pending = this.db
      .prepare(
        `SELECT count(*) AS n FROM idea_proposals p JOIN idea_messages m ON m.id = p.message_id
         WHERE m.idea_id = ? AND p.status = 'pending'`,
      )
      .get(id)!.n as number
    return {
      id,
      publicationId: row.publication_id as string,
      name: row.name as string,
      // Transitional: see `Idea.notes`. It is assembled from the notes table; ideas has no such column.
      notes: notesToMarkdown(this.notes.list(id).map((n) => n.text)),
      articles,
      drafts,
      pendingSuggestions: pending,
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
  contents(id: string): { drafts: number; notes: number; articles: number } {
    const n = (table: string) =>
      (
        this.db.prepare(`SELECT count(*) AS n FROM ${table} WHERE idea_id = ?`).get(id) as {
          n: number
        }
      ).n
    return { drafts: n('drafts'), notes: n('idea_notes'), articles: n('articles') }
  }

  /**
   * Hands the idea, with its drafts, notes and links, to another publication. Everything that hangs off the idea or a
   * draft (comments, reviews, critique rounds, the brainstorm thread, research) follows by their ids. An article
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
      .prepare('UPDATE articles SET publication_id = ?, source_id = NULL WHERE idea_id = ?')
      .run(toPublicationId, id)
  }

  countArticles(ideaId: string): number {
    return this.articles.count(ideaId)
  }

  /** Adds an item to the articles; `origin` says what put it there (the writer, unless a feature did). */
  addLink(
    ideaId: string,
    input: Omit<ArticleWrite, 'authors'> & { authors?: string[]; why?: string },
    origin: ArticleOrigin = 'entered',
  ): Article {
    const publicationId = (
      this.db.prepare('SELECT publication_id FROM ideas WHERE id = ?').get(ideaId) as {
        publication_id: string
      }
    ).publication_id
    const link = this.articles.add(publicationId, ideaId, input, origin)
    this.touch(ideaId)
    return link
  }

  /** Marks an item read (when the writer says so) or unread again. Marking read again keeps the first date. */
  setArticleRead(ideaId: string, articleId: string, read: boolean): boolean {
    const changed = this.articles.setRead(ideaId, articleId, read)
    if (changed) this.touch(ideaId)
    return changed
  }

  /** Gives an item exactly these tags. */
  setArticleTags(ideaId: string, articleId: string, tags: string[]): boolean {
    const saved = this.articles.setTags(ideaId, articleId, tags)
    if (saved) this.touch(ideaId)
    return !!saved
  }

  updateLink(ideaId: string, articleId: string, input: ArticleWrite): boolean {
    const changed = this.articles.update(ideaId, articleId, input)
    if (changed) this.touch(ideaId)
    return changed
  }

  removeLink(ideaId: string, articleId: string): boolean {
    const removed = this.articles.remove(ideaId, articleId)
    if (removed) this.touch(ideaId)
    return removed
  }

  touch(id: string, now = nowIso()) {
    this.db.prepare('UPDATE ideas SET updated_at = ? WHERE id = ?').run(now, id)
  }
}

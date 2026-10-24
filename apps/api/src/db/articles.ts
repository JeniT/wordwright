import { randomUUID } from 'node:crypto'
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite'
import { PUBLICATION_ARTICLE_DAYS, type Article, type ArticleOrigin } from '@wordwright/core'
import { nowIso } from './database'
import { parseNames } from './names'
import { owned, type Owner } from './owner'

type Row = Record<string, SQLOutputValue>

/** What is written for an article: the address, the title (maybe empty) and who wrote it. */
export type ArticleWrite = { url: string; title: string; authors: string[] }

const toLink = (l: Row): Article => ({
  id: l.id as string,
  url: l.url as string,
  title: l.title as string,
  authors: parseNames(l.authors),
  readAt: l.read_at as string | null,
  origin: l.origin as ArticleOrigin,
  why: (l.why as string | null) ?? null,
  tags: [],
  kept: l.kept === 1,
  addedAt: l.created_at as string,
})

const COLUMNS = 'id, url, title, authors, read_at, origin, why, kept, created_at'

/**
 * Reading-list items, for an idea or for a publication as a whole (see `Owner`). Callers check that the person
 * belongs to the publication and that the idea is in it. The idea's `updated_at` is the caller's to touch.
 */
export class ArticleStore {
  constructor(private readonly db: DatabaseSync) {}

  /**
   * Items on a publication's own list that are a month old (`PUBLICATION_ARTICLE_DAYS`) are dropped, silently, unless they are
   * kept or notes were taken from them (dropping those would leave the notes with no source). The age is how long since
   * the item was put on this list. An idea's list is never swept. Done whenever the publication's list is looked at, so
   * there is no background job; returns how many were dropped.
   */
  dropOld(publicationId: string): number {
    const cutoff = new Date(Date.now() - PUBLICATION_ARTICLE_DAYS * 86_400_000).toISOString()
    return Number(
      this.db
        .prepare(
          `DELETE FROM articles
           WHERE publication_id = ? AND idea_id IS NULL AND kept = 0 AND created_at < ?
             AND id NOT IN (SELECT article_id FROM idea_notes WHERE article_id IS NOT NULL)`,
        )
        .run(publicationId, cutoff).changes,
    )
  }

  /** Unread first, then in the order they were added. */
  list(owner: Owner): Article[] {
    if (typeof owner !== 'string') this.dropOld(owner.publicationId)
    const w = owned(owner)
    return this.withTags(
      this.db
        .prepare(
          `SELECT ${COLUMNS} FROM articles WHERE ${w.sql} ORDER BY (read_at IS NOT NULL), created_at, rowid`,
        )
        .all(...w.args)
        .map(toLink),
    )
  }

  /** Fills in each item's tags (in the order they were given) with one read for all of them. */
  private withTags(articles: Article[]): Article[] {
    if (!articles.length) return articles
    const byArticle = new Map(articles.map((l) => [l.id, l]))
    const marks = articles.map(() => '?').join(', ')
    const rows = this.db
      .prepare(
        `SELECT article_id, tag FROM article_tags WHERE article_id IN (${marks}) ORDER BY rowid`,
      )
      .all(...articles.map((l) => l.id))
    for (const r of rows) byArticle.get(r.article_id as string)?.tags.push(r.tag as string)
    return articles
  }

  /** Gives an item exactly these tags (already tidied and free of repeats). Call inside a transaction. */
  setTags(owner: Owner, id: string, tags: string[]): Article | undefined {
    if (!this.get(owner, id)) return undefined
    this.db.prepare('DELETE FROM article_tags WHERE article_id = ?').run(id)
    const insert = this.db.prepare('INSERT INTO article_tags (article_id, tag) VALUES (?, ?)')
    for (const tag of tags) insert.run(id, tag)
    return this.get(owner, id)
  }

  count(owner: Owner): number {
    if (typeof owner !== 'string') this.dropOld(owner.publicationId)
    const w = owned(owner)
    return (
      this.db.prepare(`SELECT count(*) AS n FROM articles WHERE ${w.sql}`).get(...w.args) as {
        n: number
      }
    ).n
  }

  get(owner: Owner, id: string): Article | undefined {
    const w = owned(owner)
    const row = this.db
      .prepare(`SELECT ${COLUMNS} FROM articles WHERE ${w.sql} AND id = ?`)
      .get(...w.args, id)
    return row && this.withTags([toLink(row)])[0]
  }

  /** Every item's address in the publication, wherever it is (the publication's own list or any idea's), and when it was put there. */
  addresses(publicationId: string): { url: string; createdAt: string }[] {
    this.dropOld(publicationId)
    return this.db
      .prepare('SELECT url, created_at FROM articles WHERE publication_id = ?')
      .all(publicationId)
      .map((r) => ({ url: r.url as string, createdAt: r.created_at as string }))
  }

  /**
   * An item wherever it is in the publication: with the idea it belongs to (null: the publication itself). For moving.
   */
  locate(publicationId: string, id: string): { link: Article; ideaId: string | null } | undefined {
    const row = this.db
      .prepare(`SELECT ${COLUMNS}, idea_id FROM articles WHERE publication_id = ? AND id = ?`)
      .get(publicationId, id)
    return row && { link: this.withTags([toLink(row)])[0]!, ideaId: row.idea_id as string | null }
  }

  /** Adds an item to the articles; `origin` says what put it there (the writer, unless a feature did). */
  add(
    publicationId: string,
    ideaId: string | null,
    input: Omit<ArticleWrite, 'authors'> & {
      authors?: string[]
      why?: string | null
      readAt?: string | null
      /** The feed it came from, for items added from the publication's feeds. */
      sourceId?: string | null
    },
    origin: ArticleOrigin = 'entered',
  ): Article {
    const id = randomUUID()
    const createdAt = nowIso()
    // A link the writer pasted into the publication's own list is theirs to keep: only what a feed brought drops off.
    const kept = ideaId === null && origin === 'entered'
    this.db
      .prepare(
        `INSERT INTO articles (id, publication_id, idea_id, url, title, authors, origin, why, read_at, source_id, created_at, kept)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        publicationId,
        ideaId,
        input.url,
        input.title,
        JSON.stringify(input.authors ?? []),
        origin,
        input.why ?? null,
        input.readAt ?? null,
        input.sourceId ?? null,
        createdAt,
        kept ? 1 : 0,
      )
    return {
      id,
      url: input.url,
      title: input.title,
      authors: input.authors ?? [],
      readAt: input.readAt ?? null,
      origin,
      why: input.why ?? null,
      tags: [],
      kept,
      addedAt: createdAt,
    }
  }

  /** Marks an item read (when the writer says so) or unread again. Marking read again keeps the first date. */
  setRead(owner: Owner, id: string, read: boolean): boolean {
    const w = owned(owner)
    return (
      this.db
        .prepare(
          `UPDATE articles SET read_at = CASE WHEN ? THEN coalesce(read_at, ?) ELSE NULL END
           WHERE ${w.sql} AND id = ?`,
        )
        .run(read ? 1 : 0, nowIso(), ...w.args, id).changes > 0
    )
  }

  update(owner: Owner, id: string, input: ArticleWrite): boolean {
    const w = owned(owner)
    return (
      this.db
        .prepare(`UPDATE articles SET url = ?, title = ?, authors = ? WHERE ${w.sql} AND id = ?`)
        .run(input.url, input.title, JSON.stringify(input.authors), ...w.args, id).changes > 0
    )
  }

  remove(owner: Owner, id: string): boolean {
    const w = owned(owner)
    return (
      this.db.prepare(`DELETE FROM articles WHERE ${w.sql} AND id = ?`).run(...w.args, id).changes >
      0
    )
  }

  /**
   * Hands an item to an idea, or to the publication (`null`). It keeps everything else about it, except that it starts
   * afresh on the publication's list (its month begins again, and it is no longer kept) and an idea's list has no keeping.
   */
  setOwner(publicationId: string, id: string, toPublicationId: string, ideaId: string | null) {
    // A feed belongs to one publication, so an item that leaves it no longer comes from one.
    this.db
      .prepare(
        `UPDATE articles SET publication_id = ?, idea_id = ?, kept = 0,
           source_id = CASE WHEN publication_id = ? THEN source_id END,
           created_at = CASE WHEN ? IS NULL THEN ? ELSE created_at END
         WHERE publication_id = ? AND id = ?`,
      )
      .run(toPublicationId, ideaId, toPublicationId, ideaId, nowIso(), publicationId, id)
  }

  /** Asks for an item of the publication's own list to be kept (or not). */
  setKept(publicationId: string, id: string, kept: boolean): boolean {
    return (
      this.db
        .prepare(
          'UPDATE articles SET kept = ? WHERE publication_id = ? AND idea_id IS NULL AND id = ?',
        )
        .run(kept ? 1 : 0, publicationId, id).changes > 0
    )
  }
}

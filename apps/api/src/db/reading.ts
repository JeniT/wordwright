import { randomUUID } from 'node:crypto'
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite'
import { PROFILE_READING_DAYS, type IdeaLink, type ReadingOrigin } from '@lfwa/core'
import { nowIso } from './database'
import { parseNames } from './names'
import { owned, type Owner } from './owner'

type Row = Record<string, SQLOutputValue>

/** What is written for a reading-list item: the address, the title (maybe empty) and who wrote it. */
export type LinkWrite = { url: string; title: string; authors: string[] }

const toLink = (l: Row): IdeaLink => ({
  id: l.id as string,
  url: l.url as string,
  title: l.title as string,
  authors: parseNames(l.authors),
  readAt: l.read_at as string | null,
  origin: l.origin as ReadingOrigin,
  why: (l.why as string | null) ?? null,
  kept: l.kept === 1,
  addedAt: l.created_at as string,
})

const COLUMNS = 'id, url, title, authors, read_at, origin, why, kept, created_at'

/**
 * Reading-list items, for an idea or for a profile as a whole (see `Owner`). Callers check that the person
 * belongs to the profile and that the idea is in it. The idea's `updated_at` is the caller's to touch.
 */
export class ReadingStore {
  constructor(private readonly db: DatabaseSync) {}

  /**
   * Items on a profile's own list that are a month old (`PROFILE_READING_DAYS`) are dropped, silently, unless they are
   * kept or notes were taken from them (dropping those would leave the notes with no source). The age is how long since
   * the item was put on this list. An idea's list is never swept. Done whenever the profile's list is looked at, so
   * there is no background job; returns how many were dropped.
   */
  dropOld(profileId: string): number {
    const cutoff = new Date(Date.now() - PROFILE_READING_DAYS * 86_400_000).toISOString()
    return Number(
      this.db
        .prepare(
          `DELETE FROM idea_links
           WHERE profile_id = ? AND idea_id IS NULL AND kept = 0 AND created_at < ?
             AND id NOT IN (SELECT reading_item_id FROM idea_notes WHERE reading_item_id IS NOT NULL)`,
        )
        .run(profileId, cutoff).changes,
    )
  }

  /** Unread first, then in the order they were added. */
  list(owner: Owner): IdeaLink[] {
    if (typeof owner !== 'string') this.dropOld(owner.profileId)
    const w = owned(owner)
    return this.db
      .prepare(
        `SELECT ${COLUMNS} FROM idea_links WHERE ${w.sql} ORDER BY (read_at IS NOT NULL), created_at, rowid`,
      )
      .all(...w.args)
      .map(toLink)
  }

  count(owner: Owner): number {
    if (typeof owner !== 'string') this.dropOld(owner.profileId)
    const w = owned(owner)
    return (
      this.db.prepare(`SELECT count(*) AS n FROM idea_links WHERE ${w.sql}`).get(...w.args) as {
        n: number
      }
    ).n
  }

  get(owner: Owner, id: string): IdeaLink | undefined {
    const w = owned(owner)
    const row = this.db
      .prepare(`SELECT ${COLUMNS} FROM idea_links WHERE ${w.sql} AND id = ?`)
      .get(...w.args, id)
    return row && toLink(row)
  }

  /** Every item's address in the profile, wherever it is (the profile's own list or any idea's), and when it was put there. */
  addresses(profileId: string): { url: string; createdAt: string }[] {
    this.dropOld(profileId)
    return this.db
      .prepare('SELECT url, created_at FROM idea_links WHERE profile_id = ?')
      .all(profileId)
      .map((r) => ({ url: r.url as string, createdAt: r.created_at as string }))
  }

  /**
   * An item wherever it is in the profile: with the idea it belongs to (null: the profile itself). For moving.
   */
  locate(profileId: string, id: string): { link: IdeaLink; ideaId: string | null } | undefined {
    const row = this.db
      .prepare(`SELECT ${COLUMNS}, idea_id FROM idea_links WHERE profile_id = ? AND id = ?`)
      .get(profileId, id)
    return row && { link: toLink(row), ideaId: row.idea_id as string | null }
  }

  /** Adds an item to the reading list; `origin` says what put it there (the writer, unless a feature did). */
  add(
    profileId: string,
    ideaId: string | null,
    input: Omit<LinkWrite, 'authors'> & {
      authors?: string[]
      why?: string | null
      readAt?: string | null
      /** The feed it came from, for items added from the profile's feeds. */
      sourceId?: string | null
    },
    origin: ReadingOrigin = 'entered',
  ): IdeaLink {
    const id = randomUUID()
    const createdAt = nowIso()
    // A link the writer pasted into the profile's own list is theirs to keep: only what a feed brought drops off.
    const kept = ideaId === null && origin === 'entered'
    this.db
      .prepare(
        `INSERT INTO idea_links (id, profile_id, idea_id, url, title, authors, origin, why, read_at, source_id, created_at, kept)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        profileId,
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
          `UPDATE idea_links SET read_at = CASE WHEN ? THEN coalesce(read_at, ?) ELSE NULL END
           WHERE ${w.sql} AND id = ?`,
        )
        .run(read ? 1 : 0, nowIso(), ...w.args, id).changes > 0
    )
  }

  update(owner: Owner, id: string, input: LinkWrite): boolean {
    const w = owned(owner)
    return (
      this.db
        .prepare(`UPDATE idea_links SET url = ?, title = ?, authors = ? WHERE ${w.sql} AND id = ?`)
        .run(input.url, input.title, JSON.stringify(input.authors), ...w.args, id).changes > 0
    )
  }

  remove(owner: Owner, id: string): boolean {
    const w = owned(owner)
    return (
      this.db.prepare(`DELETE FROM idea_links WHERE ${w.sql} AND id = ?`).run(...w.args, id)
        .changes > 0
    )
  }

  /**
   * Hands an item to an idea, or to the profile (`null`). It keeps everything else about it, except that it starts
   * afresh on the profile's list (its month begins again, and it is no longer kept) and an idea's list has no keeping.
   */
  setOwner(profileId: string, id: string, ideaId: string | null) {
    this.db
      .prepare(
        `UPDATE idea_links SET idea_id = ?, kept = 0, created_at = CASE WHEN ? IS NULL THEN ? ELSE created_at END
         WHERE profile_id = ? AND id = ?`,
      )
      .run(ideaId, ideaId, nowIso(), profileId, id)
  }

  /** Asks for an item of the profile's own list to be kept (or not). */
  setKept(profileId: string, id: string, kept: boolean): boolean {
    return (
      this.db
        .prepare(
          'UPDATE idea_links SET kept = ? WHERE profile_id = ? AND idea_id IS NULL AND id = ?',
        )
        .run(kept ? 1 : 0, profileId, id).changes > 0
    )
  }
}

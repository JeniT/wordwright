import { randomUUID } from 'node:crypto'
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite'
import type { IdeaLink, ReadingOrigin } from '@lfwa/core'
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
})

const COLUMNS = 'id, url, title, authors, read_at, origin, why'

/**
 * Reading-list items, for an idea or for a profile as a whole (see `Owner`). Callers check that the person
 * belongs to the profile and that the idea is in it. The idea's `updated_at` is the caller's to touch.
 */
export class ReadingStore {
  constructor(private readonly db: DatabaseSync) {}

  /** Unread first, then in the order they were added. */
  list(owner: Owner): IdeaLink[] {
    const w = owned(owner)
    return this.db
      .prepare(
        `SELECT ${COLUMNS} FROM idea_links WHERE ${w.sql} ORDER BY (read_at IS NOT NULL), created_at, rowid`,
      )
      .all(...w.args)
      .map(toLink)
  }

  count(owner: Owner): number {
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
    this.db
      .prepare(
        `INSERT INTO idea_links (id, profile_id, idea_id, url, title, authors, origin, why, read_at, source_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        nowIso(),
      )
    return {
      id,
      url: input.url,
      title: input.title,
      authors: input.authors ?? [],
      readAt: input.readAt ?? null,
      origin,
      why: input.why ?? null,
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

  /** Hands an item to an idea, or to the profile (`null`). It keeps everything else about it. */
  setOwner(profileId: string, id: string, ideaId: string | null) {
    this.db
      .prepare('UPDATE idea_links SET idea_id = ? WHERE profile_id = ? AND id = ?')
      .run(ideaId, profileId, id)
  }
}

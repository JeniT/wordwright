import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type {
  FeedDetails,
  FeedItem,
  FeedValidators,
  FetchedIcon,
  IconType,
  Source,
} from '@wordwright/core'
import { nowIso } from './database'
import { renumber } from './ordering'

export interface SourceIcon {
  contentType: IconType
  data: Uint8Array
}

interface Row {
  id: string
  url: string
  title: string | null
  description: string | null
  site_url: string | null
  icon_updated_at: string | null
  icon_square: number | null
  last_worked_at: string | null
  last_error: string | null
}

/** What we last learned from reading a feed's posts. */
export interface SourceFetch {
  items: FeedItem[]
  validators: FeedValidators
  checkedAt: string | null
  lastWorkedAt: string | null
  lastError: string | null
  lastErrorAt: string | null
}

/**
 * Sources are always accessed through their publication; callers check membership first. `remove` and
 * `reorder` make several writes, so routes call them inside `store.transaction`.
 */
export class SourceStore {
  constructor(private readonly db: DatabaseSync) {}

  /** In priority order, highest first. */
  list(publicationId: string): Source[] {
    return (
      this.db
        .prepare(
          `SELECT s.id, s.url, s.title, s.description, s.site_url, i.updated_at AS icon_updated_at, i.square AS icon_square,
                  f.last_worked_at, f.last_error
           FROM publication_sources s
           LEFT JOIN publication_source_icons i ON i.source_id = s.id
           LEFT JOIN publication_source_fetches f ON f.source_id = s.id
           WHERE s.publication_id = ? ORDER BY s.position`,
        )
        .all(publicationId) as unknown as Row[]
    ).map((r) => toSource(publicationId, r))
  }

  count(publicationId: string): number {
    const row = this.db
      .prepare('SELECT count(*) AS n FROM publication_sources WHERE publication_id = ?')
      .get(publicationId) as { n: number }
    return row.n
  }

  has(publicationId: string, url: string): boolean {
    return (
      this.db
        .prepare('SELECT 1 FROM publication_sources WHERE publication_id = ? AND url = ?')
        .get(publicationId, url) !== undefined
    )
  }

  /**
   * Adds to the end of the list (lowest priority). Callers check `has` and `count` first, in the
   * same transaction. `details` is what the feed said about itself; without it only the address is kept.
   */
  add(
    publicationId: string,
    url: string,
    details?: FeedDetails,
    icon?: (FetchedIcon & { square?: boolean }) | null,
  ): Source {
    const id = randomUUID()
    const now = nowIso()
    this.db
      .prepare(
        `INSERT INTO publication_sources (id, publication_id, url, title, description, site_url, position, created_at)
         VALUES (?, ?, ?, ?, ?, ?, (SELECT coalesce(max(position) + 1, 0) FROM publication_sources WHERE publication_id = ?), ?)`,
      )
      .run(
        id,
        publicationId,
        url,
        details?.title ?? null,
        details?.description ?? null,
        details?.siteUrl ?? null,
        publicationId,
        now,
      )
    if (icon) {
      this.db
        .prepare(
          'INSERT INTO publication_source_icons (source_id, content_type, data, updated_at, square) VALUES (?, ?, ?, ?, ?)',
        )
        .run(id, icon.contentType, icon.data, now, icon.square == null ? null : +icon.square)
    }
    return this.list(publicationId).find((s) => s.id === id)!
  }

  /** Icons stored before their shape was recorded, for the startup backfill. */
  unshapedIcons(): { sourceId: string; contentType: IconType; data: Uint8Array }[] {
    return (
      this.db
        .prepare(
          'SELECT source_id, content_type, data FROM publication_source_icons WHERE square IS NULL',
        )
        .all() as { source_id: string; content_type: IconType; data: Uint8Array }[]
    ).map((r) => ({ sourceId: r.source_id, contentType: r.content_type, data: r.data }))
  }

  setIconSquare(sourceId: string, square: boolean) {
    this.db
      .prepare('UPDATE publication_source_icons SET square = ? WHERE source_id = ?')
      .run(+square, sourceId)
  }

  getIcon(publicationId: string, id: string): SourceIcon | undefined {
    const row = this.db
      .prepare(
        `SELECT i.content_type, i.data FROM publication_source_icons i
         JOIN publication_sources s ON s.id = i.source_id WHERE s.publication_id = ? AND s.id = ?`,
      )
      .get(publicationId, id) as { content_type: IconType; data: Uint8Array } | undefined
    return row && { contentType: row.content_type, data: row.data }
  }

  publicationOf(id: string): string | undefined {
    const row = this.db
      .prepare('SELECT publication_id FROM publication_sources WHERE id = ?')
      .get(id) as { publication_id: string } | undefined
    return row?.publication_id
  }

  find(publicationId: string, id: string): Source | undefined {
    return this.list(publicationId).find((s) => s.id === id)
  }

  getFetch(sourceId: string): SourceFetch | undefined {
    const r = this.db
      .prepare('SELECT * FROM publication_source_fetches WHERE source_id = ?')
      .get(sourceId) as
      | {
          items: string
          etag: string | null
          last_modified: string | null
          checked_at: string | null
          last_worked_at: string | null
          last_error: string | null
          last_error_at: string | null
        }
      | undefined
    return (
      r && {
        items: JSON.parse(r.items) as FeedItem[],
        validators: { etag: r.etag, lastModified: r.last_modified },
        checkedAt: r.checked_at,
        lastWorkedAt: r.last_worked_at,
        lastError: r.last_error,
        lastErrorAt: r.last_error_at,
      }
    )
  }

  /** Replaces what we know about the source's posts. Callers hold the source, so it exists. */
  saveFetch(sourceId: string, f: SourceFetch) {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO publication_source_fetches
           (source_id, items, etag, last_modified, checked_at, last_worked_at, last_error, last_error_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        sourceId,
        JSON.stringify(f.items),
        f.validators.etag ?? null,
        f.validators.lastModified ?? null,
        f.checkedAt,
        f.lastWorkedAt,
        f.lastError,
        f.lastErrorAt,
      )
  }

  remove(publicationId: string, id: string): boolean {
    const removed =
      this.db
        .prepare('DELETE FROM publication_sources WHERE publication_id = ? AND id = ?')
        .run(publicationId, id).changes > 0
    if (removed)
      this.renumber(
        publicationId,
        this.list(publicationId).map((s) => s.id),
      )
    return removed
  }

  private renumber(publicationId: string, ids: string[]) {
    renumber(this.db, TABLE, scopeOf(publicationId), ids)
  }
}

const TABLE = 'publication_sources'
const scopeOf = (publicationId: string) => ({ sql: 'publication_id = ?', args: [publicationId] })

function toSource(publicationId: string, r: Row): Source {
  return {
    id: r.id,
    url: r.url,
    title: r.title,
    description: r.description,
    siteUrl: r.site_url,
    // The version changes only when the picture does, so browsers can cache it hard.
    iconUrl: r.icon_updated_at
      ? `/api/publications/${publicationId}/sources/${r.id}/icon?v=${Date.parse(r.icon_updated_at)}`
      : null,
    iconSquare: r.icon_square === 1,
    lastWorkedAt: r.last_worked_at,
    lastError: r.last_error,
  }
}

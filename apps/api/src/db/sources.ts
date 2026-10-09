import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { FeedDetails, FetchedIcon, IconType, Source } from '@lfwa/core'
import { nowIso } from './database'

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
}

/**
 * Sources are always accessed through their profile; callers check membership first. `remove` and
 * `reorder` make several writes, so routes call them inside `store.transaction`.
 */
export class SourceStore {
  constructor(private readonly db: DatabaseSync) {}

  /** In priority order, highest first. */
  list(profileId: string): Source[] {
    return (
      this.db
        .prepare(
          `SELECT s.id, s.url, s.title, s.description, s.site_url, i.updated_at AS icon_updated_at
           FROM profile_sources s LEFT JOIN profile_source_icons i ON i.source_id = s.id
           WHERE s.profile_id = ? ORDER BY s.position`,
        )
        .all(profileId) as unknown as Row[]
    ).map((r) => toSource(profileId, r))
  }

  count(profileId: string): number {
    const row = this.db
      .prepare('SELECT count(*) AS n FROM profile_sources WHERE profile_id = ?')
      .get(profileId) as { n: number }
    return row.n
  }

  has(profileId: string, url: string): boolean {
    return (
      this.db
        .prepare('SELECT 1 FROM profile_sources WHERE profile_id = ? AND url = ?')
        .get(profileId, url) !== undefined
    )
  }

  /**
   * Adds to the end of the list (lowest priority). Callers check `has` and `count` first, in the
   * same transaction. `details` is what the feed said about itself; without it only the address is kept.
   */
  add(profileId: string, url: string, details?: FeedDetails, icon?: FetchedIcon | null): Source {
    const id = randomUUID()
    const now = nowIso()
    this.db
      .prepare(
        `INSERT INTO profile_sources (id, profile_id, url, title, description, site_url, position, created_at)
         VALUES (?, ?, ?, ?, ?, ?, (SELECT coalesce(max(position) + 1, 0) FROM profile_sources WHERE profile_id = ?), ?)`,
      )
      .run(
        id,
        profileId,
        url,
        details?.title ?? null,
        details?.description ?? null,
        details?.siteUrl ?? null,
        profileId,
        now,
      )
    if (icon) {
      this.db
        .prepare(
          'INSERT INTO profile_source_icons (source_id, content_type, data, updated_at) VALUES (?, ?, ?, ?)',
        )
        .run(id, icon.contentType, icon.data, now)
    }
    return this.list(profileId).find((s) => s.id === id)!
  }

  getIcon(profileId: string, id: string): SourceIcon | undefined {
    const row = this.db
      .prepare(
        `SELECT i.content_type, i.data FROM profile_source_icons i
         JOIN profile_sources s ON s.id = i.source_id WHERE s.profile_id = ? AND s.id = ?`,
      )
      .get(profileId, id) as { content_type: IconType; data: Uint8Array } | undefined
    return row && { contentType: row.content_type, data: row.data }
  }

  remove(profileId: string, id: string): boolean {
    const removed =
      this.db
        .prepare('DELETE FROM profile_sources WHERE profile_id = ? AND id = ?')
        .run(profileId, id).changes > 0
    if (removed)
      this.renumber(
        profileId,
        this.list(profileId).map((s) => s.id),
      )
    return removed
  }

  /**
   * Puts the sources in the given order. Returns false, changing nothing, unless `ids` names
   * exactly the profile's current sources (so a stale screen can't silently drop or resurrect any).
   */
  reorder(profileId: string, ids: string[]): boolean {
    const current = this.list(profileId).map((s) => s.id)
    if (ids.length !== current.length || new Set(ids).size !== ids.length) return false
    const known = new Set(current)
    if (!ids.every((id) => known.has(id))) return false
    this.renumber(profileId, ids)
    return true
  }

  private renumber(profileId: string, ids: string[]) {
    const update = this.db.prepare(
      'UPDATE profile_sources SET position = ? WHERE profile_id = ? AND id = ?',
    )
    ids.forEach((id, position) => update.run(position, profileId, id))
  }
}

function toSource(profileId: string, r: Row): Source {
  return {
    id: r.id,
    url: r.url,
    title: r.title,
    description: r.description,
    siteUrl: r.site_url,
    // The version changes only when the picture does, so browsers can cache it hard.
    iconUrl: r.icon_updated_at
      ? `/api/profiles/${profileId}/sources/${r.id}/icon?v=${Date.parse(r.icon_updated_at)}`
      : null,
  }
}

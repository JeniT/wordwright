import type { DatabaseSync } from 'node:sqlite'
import {
  firstAvailable,
  publicationIdFor,
  type IconType,
  type ImageType,
  type Publication,
  type PublicationMember,
  type PublicationRole,
} from '@wordwright/core'
import { nowIso } from './database'

export interface PublicationImage {
  contentType: ImageType
  data: Uint8Array
}

export interface SiteIcon {
  contentType: IconType
  data: Uint8Array
}

/**
 * Every column that holds a publication's id, so that renaming a publication changes it everywhere at once. A new
 * column that references `publications` must be added here; a database test compares this with the schema.
 * (`publication_aliases.publication_id` is handled by hand, as it keeps the old ids.)
 */
export const PUBLICATION_REFERENCES: [table: string, column: string][] = [
  ['publications', 'id'],
  ['publication_members', 'publication_id'],
  ['publication_images', 'publication_id'],
  ['publication_site_icons', 'publication_id'],
  ['drafts', 'publication_id'],
  ['ideas', 'publication_id'],
  ['idea_notes', 'publication_id'],
  ['idea_links', 'publication_id'],
  ['invitations', 'publication_id'],
  ['publication_sources', 'publication_id'],
  ['feed_post_ignores', 'publication_id'],
  ['moves', 'publication_id'],
  ['moves', 'to_publication_id'],
]

export class PublicationStore {
  constructor(private readonly db: DatabaseSync) {}

  /**
   * Creates a publication with `ownerId` as its owner. Its id is `<owner handle>-<slug of name>`;
   * if the owner already has a publication with that slug, a number is added (`jenit-substack-2`).
   */
  create(name: string, ownerId: string, siteUrl: string | null = null): string {
    const owner = this.db.prepare('SELECT handle FROM users WHERE id = ?').get(ownerId) as
      { handle: string } | undefined
    if (!owner) throw new Error(`No such user: ${ownerId}`)
    const id = firstAvailable(publicationIdFor(owner.handle, name), (c) => this.exists(c), '-')
    this.db
      .prepare('INSERT INTO publications (id, name, site_url, created_at) VALUES (?, ?, ?, ?)')
      .run(id, name, siteUrl, nowIso())
    this.addMember(id, ownerId, 'owner')
    return id
  }

  /** Taken by a publication, or retired by a rename: old addresses are never handed to someone else. */
  private exists(id: string): boolean {
    return (
      this.db
        .prepare(
          'SELECT 1 FROM publications WHERE id = ? UNION SELECT 1 FROM publication_aliases WHERE old_id = ?',
        )
        .get(id, id) !== undefined
    )
  }

  /**
   * Changes only the fields that are present; `siteUrl: null` clears the link. Renaming also
   * renames the publication's id (see `publicationIdFor`), leaving the old id as an alias. Returns the
   * publication's id afterwards, which callers must use from then on. Call inside a transaction: it makes several
   * writes, and the id changes in every table that points at the publication or in none.
   */
  update(id: string, changes: { name?: string; siteUrl?: string | null }): string {
    if (changes.siteUrl !== undefined) {
      this.db.prepare('UPDATE publications SET site_url = ? WHERE id = ?').run(changes.siteUrl, id)
    }
    if (changes.name === undefined) return id
    this.db.prepare('UPDATE publications SET name = ? WHERE id = ?').run(changes.name, id)
    return this.rewriteId(id, changes.name)
  }

  private rewriteId(id: string, name: string): string {
    const owner = this.db
      .prepare(
        `SELECT u.handle FROM publication_members m JOIN users u ON u.id = m.user_id
         WHERE m.publication_id = ? AND m.role = 'owner' LIMIT 1`,
      )
      .get(id) as { handle: string } | undefined
    if (!owner) return id
    const mine = (candidate: string) =>
      candidate === id ||
      this.db
        .prepare('SELECT 1 FROM publication_aliases WHERE old_id = ? AND publication_id = ?')
        .get(candidate, id) !== undefined
    const next = firstAvailable(
      publicationIdFor(owner.handle, name),
      (c) => !mine(c) && this.exists(c), // going back to a name you used before reclaims its address
      '-',
    )
    if (next === id) return id

    // Every column that points at a publication, so the id changes everywhere at once or not at all.
    this.db.exec('PRAGMA defer_foreign_keys = ON') // until the transaction ends, when every reference must hold
    this.db.prepare('DELETE FROM publication_aliases WHERE old_id = ?').run(next)
    this.db
      .prepare('UPDATE publication_aliases SET publication_id = ? WHERE publication_id = ?')
      .run(next, id)
    this.db
      .prepare('INSERT INTO publication_aliases (old_id, publication_id) VALUES (?, ?)')
      .run(id, next)
    for (const [table, column] of PUBLICATION_REFERENCES) {
      this.db.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`).run(next, id)
    }
    return next
  }

  /** A person saves the description (null clears it). */
  setDescription(id: string, description: string | null) {
    this.db.prepare('UPDATE publications SET description = ? WHERE id = ?').run(description, id)
  }

  /** The current id of the publication that used to be called `oldId`, if any. */
  currentIdFor(oldId: string): string | undefined {
    const row = this.db
      .prepare('SELECT publication_id FROM publication_aliases WHERE old_id = ?')
      .get(oldId) as { publication_id: string } | undefined
    return row?.publication_id
  }

  delete(id: string) {
    this.db.prepare('DELETE FROM publications WHERE id = ?').run(id) // cascades to members, drafts, image, sources
  }

  // -- image
  setImage(publicationId: string, image: PublicationImage) {
    this.db
      .prepare(
        `INSERT INTO publication_images (publication_id, content_type, data, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(publication_id) DO UPDATE SET content_type = excluded.content_type,
           data = excluded.data, updated_at = excluded.updated_at`,
      )
      .run(publicationId, image.contentType, image.data, nowIso())
  }

  getImage(publicationId: string): PublicationImage | undefined {
    const row = this.db
      .prepare('SELECT content_type, data FROM publication_images WHERE publication_id = ?')
      .get(publicationId) as { content_type: ImageType; data: Uint8Array } | undefined
    return row && { contentType: row.content_type, data: row.data }
  }

  deleteImage(publicationId: string) {
    this.db.prepare('DELETE FROM publication_images WHERE publication_id = ?').run(publicationId)
  }

  // -- site icon
  /** Replaces the stored icon, or removes it when the website has none (null). */
  setSiteIcon(publicationId: string, icon: SiteIcon | null) {
    if (!icon) {
      this.db
        .prepare('DELETE FROM publication_site_icons WHERE publication_id = ?')
        .run(publicationId)
      return
    }
    this.db
      .prepare(
        `INSERT INTO publication_site_icons (publication_id, content_type, data, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(publication_id) DO UPDATE SET content_type = excluded.content_type,
           data = excluded.data, updated_at = excluded.updated_at`,
      )
      .run(publicationId, icon.contentType, icon.data, nowIso())
  }

  getSiteIcon(publicationId: string): SiteIcon | undefined {
    const row = this.db
      .prepare('SELECT content_type, data FROM publication_site_icons WHERE publication_id = ?')
      .get(publicationId) as { content_type: IconType; data: Uint8Array } | undefined
    return row && { contentType: row.content_type, data: row.data }
  }

  // -- members
  addMember(publicationId: string, userId: string, role: PublicationRole) {
    this.db
      .prepare(
        'INSERT INTO publication_members (publication_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)',
      )
      .run(publicationId, userId, role, nowIso())
  }

  removeMember(publicationId: string, userId: string) {
    this.db
      .prepare('DELETE FROM publication_members WHERE publication_id = ? AND user_id = ?')
      .run(publicationId, userId)
  }

  setRole(publicationId: string, userId: string, role: PublicationRole) {
    this.db
      .prepare('UPDATE publication_members SET role = ? WHERE publication_id = ? AND user_id = ?')
      .run(role, publicationId, userId)
  }

  roleOf(publicationId: string, userId: string): PublicationRole | undefined {
    const row = this.db
      .prepare('SELECT role FROM publication_members WHERE publication_id = ? AND user_id = ?')
      .get(publicationId, userId) as { role: PublicationRole } | undefined
    return row?.role
  }

  /** Members ordered by when they joined (oldest first). */
  members(publicationId: string): PublicationMember[] {
    return (
      this.db
        .prepare(
          `SELECT u.id, u.name, u.email, m.role FROM publication_members m
           JOIN users u ON u.id = m.user_id WHERE m.publication_id = ?
           ORDER BY m.joined_at, m.rowid`,
        )
        .all(publicationId) as { id: string; name: string; email: string; role: PublicationRole }[]
    ).map((r) => ({ userId: r.id, name: r.name, email: r.email, role: r.role }))
  }

  countOwnedBy(userId: string): number {
    const row = this.db
      .prepare("SELECT count(*) AS n FROM publication_members WHERE user_id = ? AND role = 'owner'")
      .get(userId) as { n: number }
    return row.n
  }

  listIdsForUser(userId: string): string[] {
    return (
      this.db
        .prepare(
          `SELECT m.publication_id FROM publication_members m JOIN publications p ON p.id = m.publication_id
           WHERE m.user_id = ? ORDER BY p.created_at, p.id`,
        )
        .all(userId) as { publication_id: string }[]
    ).map((r) => r.publication_id)
  }

  /** The publication as seen by `userId` (who must be a member). */
  get(publicationId: string, userId: string): Publication | undefined {
    const role = this.roleOf(publicationId, userId)
    if (!role) return undefined
    const row = this.db
      .prepare(
        `SELECT p.name, p.site_url, p.description, i.updated_at AS image_updated_at,
           s.updated_at AS site_icon_updated_at FROM publications p
         LEFT JOIN publication_images i ON i.publication_id = p.id
         LEFT JOIN publication_site_icons s ON s.publication_id = p.id WHERE p.id = ?`,
      )
      .get(publicationId) as
      | {
          name: string
          site_url: string | null
          description: string | null
          image_updated_at: string | null
          site_icon_updated_at: string | null
        }
      | undefined
    return (
      row && {
        id: publicationId,
        name: row.name,
        siteUrl: row.site_url,
        // The version in the query string changes with each upload, so browsers can cache hard
        // and still show a new image straight away.
        imageUrl: row.image_updated_at
          ? `/api/publications/${publicationId}/image?v=${Date.parse(row.image_updated_at)}`
          : null,
        siteIconUrl: row.site_icon_updated_at
          ? `/api/publications/${publicationId}/site-icon?v=${Date.parse(row.site_icon_updated_at)}`
          : null,
        description: row.description,
        role,
        members: this.members(publicationId),
      }
    )
  }

  listForUser(userId: string): Publication[] {
    return this.listIdsForUser(userId).flatMap((id) => this.get(id, userId) ?? [])
  }
}

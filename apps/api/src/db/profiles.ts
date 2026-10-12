import type { DatabaseSync } from 'node:sqlite'
import {
  firstAvailable,
  profileIdFor,
  type ImageType,
  type Profile,
  type ProfileMember,
  type ProfileRole,
} from '@lfwa/core'
import { nowIso } from './database'

export interface ProfileImage {
  contentType: ImageType
  data: Uint8Array
}

export class ProfileStore {
  constructor(private readonly db: DatabaseSync) {}

  /**
   * Creates a profile with `ownerId` as its owner. Its id is `<owner handle>-<slug of name>`;
   * if the owner already has a profile with that slug, a number is added (`jenit-substack-2`).
   */
  create(name: string, ownerId: string, siteUrl: string | null = null): string {
    const owner = this.db.prepare('SELECT handle FROM users WHERE id = ?').get(ownerId) as
      { handle: string } | undefined
    if (!owner) throw new Error(`No such user: ${ownerId}`)
    const id = firstAvailable(profileIdFor(owner.handle, name), (c) => this.exists(c), '-')
    this.db
      .prepare('INSERT INTO profiles (id, name, site_url, created_at) VALUES (?, ?, ?, ?)')
      .run(id, name, siteUrl, nowIso())
    this.addMember(id, ownerId, 'owner')
    return id
  }

  /** Taken by a profile, or retired by a rename: old addresses are never handed to someone else. */
  private exists(id: string): boolean {
    return (
      this.db
        .prepare(
          'SELECT 1 FROM profiles WHERE id = ? UNION SELECT 1 FROM profile_aliases WHERE old_id = ?',
        )
        .get(id, id) !== undefined
    )
  }

  /**
   * Changes only the fields that are present; `siteUrl: null` clears the link. Renaming also
   * renames the profile's id (see `profileIdFor`), leaving the old id as an alias. Returns the
   * profile's id afterwards, which callers must use from then on. Call inside a transaction: it makes several
   * writes, and the id changes in every table that points at the profile or in none.
   */
  update(id: string, changes: { name?: string; siteUrl?: string | null }): string {
    if (changes.siteUrl !== undefined) {
      this.db.prepare('UPDATE profiles SET site_url = ? WHERE id = ?').run(changes.siteUrl, id)
    }
    if (changes.name === undefined) return id
    this.db.prepare('UPDATE profiles SET name = ? WHERE id = ?').run(changes.name, id)
    return this.rewriteId(id, changes.name)
  }

  private rewriteId(id: string, name: string): string {
    const owner = this.db
      .prepare(
        `SELECT u.handle FROM profile_members m JOIN users u ON u.id = m.user_id
         WHERE m.profile_id = ? AND m.role = 'owner' LIMIT 1`,
      )
      .get(id) as { handle: string } | undefined
    if (!owner) return id
    const mine = (candidate: string) =>
      candidate === id ||
      this.db
        .prepare('SELECT 1 FROM profile_aliases WHERE old_id = ? AND profile_id = ?')
        .get(candidate, id) !== undefined
    const next = firstAvailable(
      profileIdFor(owner.handle, name),
      (c) => !mine(c) && this.exists(c), // going back to a name you used before reclaims its address
      '-',
    )
    if (next === id) return id

    // Every table that points at a profile, so the id changes everywhere at once or not at all.
    // A new table with a `profile_id` must be added to this list (a rename test covers each one).
    this.db.exec('PRAGMA defer_foreign_keys = ON') // until the transaction ends, when every reference must hold
    this.db.prepare('DELETE FROM profile_aliases WHERE old_id = ?').run(next)
    this.db.prepare('UPDATE profile_aliases SET profile_id = ? WHERE profile_id = ?').run(next, id)
    this.db.prepare('INSERT INTO profile_aliases (old_id, profile_id) VALUES (?, ?)').run(id, next)
    for (const [table, column] of [
      ['profiles', 'id'],
      ['profile_members', 'profile_id'],
      ['profile_images', 'profile_id'],
      ['drafts', 'profile_id'],
      ['ideas', 'profile_id'],
      ['idea_notes', 'profile_id'],
      ['invitations', 'profile_id'],
      ['profile_sources', 'profile_id'],
    ]) {
      this.db.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`).run(next, id)
    }
    return next
  }

  /** The current id of the profile that used to be called `oldId`, if any. */
  currentIdFor(oldId: string): string | undefined {
    const row = this.db
      .prepare('SELECT profile_id FROM profile_aliases WHERE old_id = ?')
      .get(oldId) as { profile_id: string } | undefined
    return row?.profile_id
  }

  delete(id: string) {
    this.db.prepare('DELETE FROM profiles WHERE id = ?').run(id) // cascades to members, drafts, image, sources
  }

  // -- image
  setImage(profileId: string, image: ProfileImage) {
    this.db
      .prepare(
        `INSERT INTO profile_images (profile_id, content_type, data, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(profile_id) DO UPDATE SET content_type = excluded.content_type,
           data = excluded.data, updated_at = excluded.updated_at`,
      )
      .run(profileId, image.contentType, image.data, nowIso())
  }

  getImage(profileId: string): ProfileImage | undefined {
    const row = this.db
      .prepare('SELECT content_type, data FROM profile_images WHERE profile_id = ?')
      .get(profileId) as { content_type: ImageType; data: Uint8Array } | undefined
    return row && { contentType: row.content_type, data: row.data }
  }

  deleteImage(profileId: string) {
    this.db.prepare('DELETE FROM profile_images WHERE profile_id = ?').run(profileId)
  }

  // -- members
  addMember(profileId: string, userId: string, role: ProfileRole) {
    this.db
      .prepare(
        'INSERT INTO profile_members (profile_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)',
      )
      .run(profileId, userId, role, nowIso())
  }

  removeMember(profileId: string, userId: string) {
    this.db
      .prepare('DELETE FROM profile_members WHERE profile_id = ? AND user_id = ?')
      .run(profileId, userId)
  }

  setRole(profileId: string, userId: string, role: ProfileRole) {
    this.db
      .prepare('UPDATE profile_members SET role = ? WHERE profile_id = ? AND user_id = ?')
      .run(role, profileId, userId)
  }

  roleOf(profileId: string, userId: string): ProfileRole | undefined {
    const row = this.db
      .prepare('SELECT role FROM profile_members WHERE profile_id = ? AND user_id = ?')
      .get(profileId, userId) as { role: ProfileRole } | undefined
    return row?.role
  }

  /** Members ordered by when they joined (oldest first). */
  members(profileId: string): ProfileMember[] {
    return (
      this.db
        .prepare(
          `SELECT u.id, u.name, u.email, m.role FROM profile_members m
           JOIN users u ON u.id = m.user_id WHERE m.profile_id = ?
           ORDER BY m.joined_at, m.rowid`,
        )
        .all(profileId) as { id: string; name: string; email: string; role: ProfileRole }[]
    ).map((r) => ({ userId: r.id, name: r.name, email: r.email, role: r.role }))
  }

  countOwnedBy(userId: string): number {
    const row = this.db
      .prepare("SELECT count(*) AS n FROM profile_members WHERE user_id = ? AND role = 'owner'")
      .get(userId) as { n: number }
    return row.n
  }

  listIdsForUser(userId: string): string[] {
    return (
      this.db
        .prepare(
          `SELECT m.profile_id FROM profile_members m JOIN profiles p ON p.id = m.profile_id
           WHERE m.user_id = ? ORDER BY p.created_at, p.id`,
        )
        .all(userId) as { profile_id: string }[]
    ).map((r) => r.profile_id)
  }

  /** The profile as seen by `userId` (who must be a member). */
  get(profileId: string, userId: string): Profile | undefined {
    const role = this.roleOf(profileId, userId)
    if (!role) return undefined
    const row = this.db
      .prepare(
        `SELECT p.name, p.site_url, i.updated_at AS image_updated_at FROM profiles p
         LEFT JOIN profile_images i ON i.profile_id = p.id WHERE p.id = ?`,
      )
      .get(profileId) as
      { name: string; site_url: string | null; image_updated_at: string | null } | undefined
    return (
      row && {
        id: profileId,
        name: row.name,
        siteUrl: row.site_url,
        // The version in the query string changes with each upload, so browsers can cache hard
        // and still show a new image straight away.
        imageUrl: row.image_updated_at
          ? `/api/profiles/${profileId}/image?v=${Date.parse(row.image_updated_at)}`
          : null,
        role,
        members: this.members(profileId),
      }
    )
  }

  listForUser(userId: string): Profile[] {
    return this.listIdsForUser(userId).flatMap((id) => this.get(id, userId) ?? [])
  }
}

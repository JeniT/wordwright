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

  private exists(id: string): boolean {
    return this.db.prepare('SELECT 1 FROM profiles WHERE id = ?').get(id) !== undefined
  }

  /** Changes only the fields that are present; `siteUrl: null` clears the link. */
  update(id: string, changes: { name?: string; siteUrl?: string | null }) {
    if (changes.name !== undefined) {
      this.db.prepare('UPDATE profiles SET name = ? WHERE id = ?').run(changes.name, id)
    }
    if (changes.siteUrl !== undefined) {
      this.db.prepare('UPDATE profiles SET site_url = ? WHERE id = ?').run(changes.siteUrl, id)
    }
  }

  delete(id: string) {
    this.db.prepare('DELETE FROM profiles WHERE id = ?').run(id) // cascades to members, drafts, image
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

import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { Profile, ProfileMember, ProfileRole } from '@lfwa/core'
import { nowIso } from './database'

export class ProfileStore {
  constructor(private readonly db: DatabaseSync) {}

  /** Creates a profile with `ownerId` as its owner. */
  create(name: string, ownerId: string): string {
    const id = randomUUID()
    const now = nowIso()
    this.db
      .prepare('INSERT INTO profiles (id, name, created_at) VALUES (?, ?, ?)')
      .run(id, name, now)
    this.addMember(id, ownerId, 'owner')
    return id
  }

  rename(id: string, name: string) {
    this.db.prepare('UPDATE profiles SET name = ? WHERE id = ?').run(name, id)
  }

  delete(id: string) {
    this.db.prepare('DELETE FROM profiles WHERE id = ?').run(id) // cascades to members and drafts
  }

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
    const row = this.db.prepare('SELECT name FROM profiles WHERE id = ?').get(profileId) as
      { name: string } | undefined
    return row && { id: profileId, name: row.name, role, members: this.members(profileId) }
  }

  listForUser(userId: string): Profile[] {
    return this.listIdsForUser(userId).flatMap((id) => this.get(id, userId) ?? [])
  }
}

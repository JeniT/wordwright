import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { Invitation } from '@lfwa/core'
import { nowIso } from './database'

export interface InvitationRecord {
  id: string
  profileId: string
  profileName: string
  invitedBy: string
  inviterName: string
  email: string
  expiresAt: Date
  acceptedBy: string | null
}

/** Callers pass the *hash* of the secret token; the token itself is never stored. */
export class InvitationStore {
  constructor(private readonly db: DatabaseSync) {}

  /** One pending invitation per (profile, email): inviting again replaces the earlier link. */
  replacePending(input: {
    profileId: string
    invitedBy: string
    email: string
    tokenHash: string
    expiresAt: Date
  }): string {
    const id = randomUUID()
    this.db
      .prepare('DELETE FROM invitations WHERE profile_id = ? AND email = ? AND accepted_at IS NULL')
      .run(input.profileId, input.email)
    this.db
      .prepare(
        `INSERT INTO invitations (id, profile_id, invited_by, email, token_hash, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.profileId,
        input.invitedBy,
        input.email,
        input.tokenHash,
        nowIso(),
        input.expiresAt.toISOString(),
      )
    return id
  }

  findByTokenHash(tokenHash: string): InvitationRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT i.id, i.profile_id, i.invited_by, i.email, i.expires_at, i.accepted_by,
                p.name AS profile_name, u.name AS inviter_name
         FROM invitations i
         JOIN profiles p ON p.id = i.profile_id
         JOIN users u ON u.id = i.invited_by
         WHERE i.token_hash = ?`,
      )
      .get(tokenHash) as Record<string, string | null> | undefined
    return (
      row && {
        id: row.id!,
        profileId: row.profile_id!,
        profileName: row.profile_name!,
        invitedBy: row.invited_by!,
        inviterName: row.inviter_name!,
        email: row.email!,
        expiresAt: new Date(row.expires_at!),
        acceptedBy: row.accepted_by ?? null,
      }
    )
  }

  /** Pending (unaccepted, unexpired) invitations for a profile, newest first. */
  listPending(profileId: string, now: Date): Invitation[] {
    return (
      this.db
        .prepare(
          `SELECT id, email, expires_at FROM invitations
           WHERE profile_id = ? AND accepted_at IS NULL AND expires_at > ?
           ORDER BY created_at DESC, rowid DESC`,
        )
        .all(profileId, now.toISOString()) as { id: string; email: string; expires_at: string }[]
    ).map((r) => ({ id: r.id, email: r.email, expiresAt: r.expires_at }))
  }

  markAccepted(id: string, userId: string) {
    this.db
      .prepare('UPDATE invitations SET accepted_by = ?, accepted_at = ? WHERE id = ?')
      .run(userId, nowIso(), id)
  }

  revoke(profileId: string, id: string): boolean {
    return (
      this.db
        .prepare('DELETE FROM invitations WHERE profile_id = ? AND id = ? AND accepted_at IS NULL')
        .run(profileId, id).changes > 0
    )
  }

  /**
   * Removes pending invitations that have expired, and accepted ones once they are older than `keepAcceptedSince`
   * (they're kept a while so that re-opening an accepted link stays harmless).
   */
  deleteExpired(now: Date, keepAcceptedSince: Date): number {
    return Number(
      this.db
        .prepare(
          `DELETE FROM invitations
           WHERE (accepted_at IS NULL AND expires_at <= ?) OR (accepted_at IS NOT NULL AND accepted_at < ?)`,
        )
        .run(now.toISOString(), keepAcceptedSince.toISOString()).changes,
    )
  }

  /** Invitations addressed to this email (used when that person deletes their account). */
  deleteForEmail(email: string) {
    this.db.prepare('DELETE FROM invitations WHERE email = ?').run(email)
  }
}

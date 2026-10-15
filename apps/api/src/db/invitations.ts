import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { Invitation, InvitationBlocks } from '@wordwright/core'
import { nowIso } from './database'

export interface InvitationRecord {
  id: string
  publicationId: string
  publicationName: string
  invitedBy: string
  inviterName: string
  email: string
  expiresAt: Date
  acceptedBy: string | null
}

/** Callers pass the *hash* of the secret token; the token itself is never stored. */
export class InvitationStore {
  constructor(private readonly db: DatabaseSync) {}

  /** One pending invitation per (publication, email): inviting again replaces the earlier link. */
  replacePending(input: {
    publicationId: string
    invitedBy: string
    email: string
    tokenHash: string
    expiresAt: Date
  }): string {
    const id = randomUUID()
    this.db
      .prepare(
        'DELETE FROM invitations WHERE publication_id = ? AND email = ? AND accepted_at IS NULL',
      )
      .run(input.publicationId, input.email)
    this.db
      .prepare(
        `INSERT INTO invitations (id, publication_id, invited_by, email, token_hash, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.publicationId,
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
        `SELECT i.id, i.publication_id, i.invited_by, i.email, i.expires_at, i.accepted_by,
                p.name AS publication_name, u.name AS inviter_name
         FROM invitations i
         JOIN publications p ON p.id = i.publication_id
         JOIN users u ON u.id = i.invited_by
         WHERE i.token_hash = ?`,
      )
      .get(tokenHash) as Record<string, string | null> | undefined
    return (
      row && {
        id: row.id!,
        publicationId: row.publication_id!,
        publicationName: row.publication_name!,
        invitedBy: row.invited_by!,
        inviterName: row.inviter_name!,
        email: row.email!,
        expiresAt: new Date(row.expires_at!),
        acceptedBy: row.accepted_by ?? null,
      }
    )
  }

  /** Pending (unaccepted, unexpired) invitations for a publication, newest first. */
  listPending(publicationId: string, now: Date): Invitation[] {
    return (
      this.db
        .prepare(
          `SELECT id, email, expires_at FROM invitations
           WHERE publication_id = ? AND accepted_at IS NULL AND expires_at > ?
           ORDER BY created_at DESC, rowid DESC`,
        )
        .all(publicationId, now.toISOString()) as {
        id: string
        email: string
        expires_at: string
      }[]
    ).map((r) => ({ id: r.id, email: r.email, expiresAt: r.expires_at }))
  }

  markAccepted(id: string, userId: string) {
    this.db
      .prepare('UPDATE invitations SET accepted_by = ?, accepted_at = ? WHERE id = ?')
      .run(userId, nowIso(), id)
  }

  revoke(publicationId: string, id: string): boolean {
    return (
      this.db
        .prepare(
          'DELETE FROM invitations WHERE publication_id = ? AND id = ? AND accepted_at IS NULL',
        )
        .run(publicationId, id).changes > 0
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

  /** Removes a pending invitation. Returns false if it wasn't there (already accepted or gone). */
  deletePending(id: string): boolean {
    return (
      this.db.prepare('DELETE FROM invitations WHERE id = ? AND accepted_at IS NULL').run(id)
        .changes > 0
    )
  }

  // -- blocks (the invitee's choice not to receive invitations)

  /** `senderId` null blocks every sender. Also withdraws what's already pending from them. */
  addBlock(email: string, senderId: string | null) {
    this.db
      .prepare(
        'INSERT OR IGNORE INTO invitation_blocks (email, sender_id, created_at) VALUES (?, ?, ?)',
      )
      .run(email, senderId, nowIso())
    this.db
      .prepare(
        `DELETE FROM invitations WHERE email = ? AND accepted_at IS NULL AND (? IS NULL OR invited_by = ?)`,
      )
      .run(email, senderId, senderId)
  }

  removeBlock(email: string, senderId: string | null) {
    this.db
      .prepare("DELETE FROM invitation_blocks WHERE email = ? AND COALESCE(sender_id, '') = ?")
      .run(email, senderId ?? '')
  }

  /** An email change takes the person's choices with it: they were about them, not the old address. */
  moveBlocks(from: string, to: string) {
    this.db
      .prepare('UPDATE OR IGNORE invitation_blocks SET email = ? WHERE email = ?')
      .run(to, from)
    this.db.prepare('DELETE FROM invitation_blocks WHERE email = ?').run(from)
  }

  isBlocked(email: string, senderId: string): boolean {
    return (
      this.db
        .prepare(
          'SELECT 1 FROM invitation_blocks WHERE email = ? AND (sender_id IS NULL OR sender_id = ?)',
        )
        .get(email, senderId) !== undefined
    )
  }

  listBlocks(email: string): InvitationBlocks {
    const rows = this.db
      .prepare(
        `SELECT b.sender_id, u.name FROM invitation_blocks b
         LEFT JOIN users u ON u.id = b.sender_id
         WHERE b.email = ? ORDER BY b.created_at, b.rowid`,
      )
      .all(email) as { sender_id: string | null; name: string | null }[]
    return {
      all: rows.some((r) => r.sender_id === null),
      senders: rows.flatMap((r) => (r.sender_id ? [{ id: r.sender_id, name: r.name ?? '' }] : [])),
    }
  }
}

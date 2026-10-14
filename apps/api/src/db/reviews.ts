import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { ReviewState, ReviewSummary } from '@lfwa/core'
import { nowIso } from './database'

export interface ReviewRecord {
  id: string
  draftId: string
  reviewerId: string
  state: ReviewState
}

export interface ReviewInvitationRecord {
  id: string
  draftId: string
  draftTitle: string
  profileName: string
  invitedBy: string
  inviterName: string
  email: string
  expiresAt: Date
  acceptedBy: string | null
}

const toRecord = (r: Record<string, unknown>): ReviewRecord => ({
  id: r.id as string,
  draftId: r.draft_id as string,
  reviewerId: r.reviewer_id as string,
  state: r.state as ReviewState,
})

/**
 * Reviews (a reviewer's grant to read one draft and comment on it) and the invitations that lead to them. Callers
 * decide who may do what; the one rule kept here is that a reviewer is only ever offered their own reviews.
 */
export class ReviewStore {
  constructor(private readonly db: DatabaseSync) {}

  // -- reviews
  /** Grants (or, if the reviewer had left or been removed, restores) access to the draft. */
  grant(draftId: string, reviewerId: string, invitedBy: string | null): ReviewRecord {
    const existing = this.forReviewer(draftId, reviewerId)
    if (existing) {
      this.db
        .prepare(
          "UPDATE draft_reviews SET state = 'open', ended_at = NULL, invited_by = ? WHERE id = ?",
        )
        .run(invitedBy, existing.id)
      return { ...existing, state: 'open' }
    }
    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO draft_reviews (id, draft_id, reviewer_id, invited_by, state, created_at)
         VALUES (?, ?, ?, ?, 'open', ?)`,
      )
      .run(id, draftId, reviewerId, invitedBy, nowIso())
    return { id, draftId, reviewerId, state: 'open' }
  }

  forReviewer(draftId: string, reviewerId: string): ReviewRecord | undefined {
    const row = this.db
      .prepare('SELECT * FROM draft_reviews WHERE draft_id = ? AND reviewer_id = ?')
      .get(draftId, reviewerId)
    return row ? toRecord(row) : undefined
  }

  /** A review by its id, only if it is this person's. */
  ownedBy(id: string, reviewerId: string): ReviewRecord | undefined {
    const row = this.db
      .prepare('SELECT * FROM draft_reviews WHERE id = ? AND reviewer_id = ?')
      .get(id, reviewerId)
    return row ? toRecord(row) : undefined
  }

  /** A review of this draft by its id (for the editor or an owner to end). */
  ofDraft(draftId: string, id: string): ReviewRecord | undefined {
    const row = this.db
      .prepare('SELECT * FROM draft_reviews WHERE id = ? AND draft_id = ?')
      .get(id, draftId)
    return row ? toRecord(row) : undefined
  }

  end(id: string, state: 'left' | 'revoked') {
    this.db
      .prepare("UPDATE draft_reviews SET state = ?, ended_at = ? WHERE id = ? AND state = 'open'")
      .run(state, nowIso(), id)
  }

  /** The reviewer's own reviews, newest first. */
  listFor(reviewerId: string): ReviewSummary[] {
    return this.db
      .prepare(
        `SELECT r.id, r.state, r.created_at, d.title AS draft_title, p.name AS profile_name,
                inviter.name AS inviter_name
         FROM draft_reviews r
         JOIN drafts d ON d.id = r.draft_id
         JOIN profiles p ON p.id = d.profile_id
         LEFT JOIN users inviter ON inviter.id = r.invited_by
         WHERE r.reviewer_id = ?
         ORDER BY r.created_at DESC, r.rowid DESC`,
      )
      .all(reviewerId)
      .map((r) => ({
        id: r.id as string,
        draftTitle: r.draft_title as string,
        profileName: r.profile_name as string,
        inviterName: (r.inviter_name as string | null) ?? null,
        state: r.state as ReviewState,
        createdAt: r.created_at as string,
      }))
  }

  /** Who is reviewing the draft, for its editor or an owner. */
  listForDraft(draftId: string) {
    return this.db
      .prepare(
        `SELECT r.id, r.state, r.created_at, u.name, u.email FROM draft_reviews r
         JOIN users u ON u.id = r.reviewer_id
         WHERE r.draft_id = ? ORDER BY r.created_at, r.rowid`,
      )
      .all(draftId)
      .map((r) => ({
        id: r.id as string,
        name: r.name as string,
        email: r.email as string,
        state: r.state as ReviewState,
        createdAt: r.created_at as string,
      }))
  }

  // -- invitations (callers pass the hash of the secret token)
  replacePending(input: {
    draftId: string
    invitedBy: string
    email: string
    tokenHash: string
    expiresAt: Date
  }): string {
    const id = randomUUID()
    this.db
      .prepare(
        'DELETE FROM review_invitations WHERE draft_id = ? AND email = ? AND accepted_by IS NULL',
      )
      .run(input.draftId, input.email)
    this.db
      .prepare(
        `INSERT INTO review_invitations (id, draft_id, invited_by, email, token_hash, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.draftId,
        input.invitedBy,
        input.email,
        input.tokenHash,
        nowIso(),
        input.expiresAt.toISOString(),
      )
    return id
  }

  findInvitation(tokenHash: string): ReviewInvitationRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT i.*, d.title AS draft_title, p.name AS profile_name, u.name AS inviter_name
         FROM review_invitations i
         JOIN drafts d ON d.id = i.draft_id
         JOIN profiles p ON p.id = d.profile_id
         JOIN users u ON u.id = i.invited_by
         WHERE i.token_hash = ?`,
      )
      .get(tokenHash)
    return (
      row && {
        id: row.id as string,
        draftId: row.draft_id as string,
        draftTitle: row.draft_title as string,
        profileName: row.profile_name as string,
        invitedBy: row.invited_by as string,
        inviterName: row.inviter_name as string,
        email: row.email as string,
        expiresAt: new Date(row.expires_at as string),
        acceptedBy: (row.accepted_by as string | null) ?? null,
      }
    )
  }

  pendingForDraft(draftId: string, now: Date) {
    return this.db
      .prepare(
        `SELECT id, email, expires_at FROM review_invitations
         WHERE draft_id = ? AND accepted_by IS NULL AND expires_at > ? ORDER BY created_at DESC, rowid DESC`,
      )
      .all(draftId, now.toISOString())
      .map((r) => ({
        id: r.id as string,
        email: r.email as string,
        expiresAt: r.expires_at as string,
      }))
  }

  markAccepted(id: string, userId: string) {
    this.db.prepare('UPDATE review_invitations SET accepted_by = ? WHERE id = ?').run(userId, id)
  }

  /** Removes a pending invitation of this draft; false if it wasn't there. */
  deletePending(draftId: string, id: string): boolean {
    return (
      this.db
        .prepare(
          'DELETE FROM review_invitations WHERE id = ? AND draft_id = ? AND accepted_by IS NULL',
        )
        .run(id, draftId).changes > 0
    )
  }

  deleteForEmail(email: string) {
    this.db.prepare('DELETE FROM review_invitations WHERE email = ?').run(email)
  }
}

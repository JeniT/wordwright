import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { ReviewState, ReviewSummary, SnapshotReviews } from '@wordwright/core'
import { nowIso } from './database'

export interface ReviewRecord {
  id: string
  draftId: string
  snapshotId: string
  reviewerId: string
  state: ReviewState
}

export interface Snapshot {
  id: string
  draftId: string
  title: string
  body: string
}

export interface ReviewInvitationRecord {
  id: string
  draftId: string
  snapshotId: string
  draftTitle: string
  publicationName: string
  invitedBy: string
  inviterName: string
  email: string
  expiresAt: Date
  acceptedBy: string | null
}

const toRecord = (r: Record<string, unknown>): ReviewRecord => ({
  id: r.id as string,
  draftId: r.draft_id as string,
  snapshotId: r.snapshot_id as string,
  reviewerId: r.reviewer_id as string,
  state: r.state as ReviewState,
})

/**
 * Reviews (a reviewer's grant to read one draft and comment on it) and the invitations that lead to them. Callers
 * decide who may do what; the one rule kept here is that a reviewer is only ever offered their own reviews.
 */
export class ReviewStore {
  constructor(private readonly db: DatabaseSync) {}

  // -- snapshots
  /** Freezes the draft's words as they are, for a review (ADR 0001). */
  createSnapshot(draftId: string, title: string, body: string, createdBy: string): Snapshot {
    const id = randomUUID()
    this.db
      .prepare(
        'INSERT INTO draft_snapshots (id, draft_id, title, body, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(id, draftId, title, body, createdBy, nowIso())
    return { id, draftId, title, body }
  }

  snapshot(id: string): Snapshot | undefined {
    const r = this.db.prepare('SELECT * FROM draft_snapshots WHERE id = ?').get(id)
    return (
      r && { id, draftId: r.draft_id as string, title: r.title as string, body: r.body as string }
    )
  }

  // -- reviews
  /** Starts a review of the snapshot by this person (or, if they somehow have one, reopens it). */
  grant(
    snapshotId: string,
    draftId: string,
    reviewerId: string,
    invitedBy: string | null,
  ): ReviewRecord {
    const existing = this.forReviewer(snapshotId, reviewerId)
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
        `INSERT INTO draft_reviews (id, draft_id, snapshot_id, reviewer_id, invited_by, state, created_at)
         VALUES (?, ?, ?, ?, ?, 'open', ?)`,
      )
      .run(id, draftId, snapshotId, reviewerId, invitedBy, nowIso())
    return { id, draftId, snapshotId, reviewerId, state: 'open' }
  }

  forReviewer(snapshotId: string, reviewerId: string): ReviewRecord | undefined {
    const row = this.db
      .prepare('SELECT * FROM draft_reviews WHERE snapshot_id = ? AND reviewer_id = ?')
      .get(snapshotId, reviewerId)
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

  /** Ends an open review; false if it was not open (so the caller does not announce it twice). */
  end(id: string, state: 'ended' | 'closed'): boolean {
    return (
      this.db
        .prepare("UPDATE draft_reviews SET state = ?, ended_at = ? WHERE id = ? AND state = 'open'")
        .run(state, nowIso(), id).changes > 0
    )
  }

  /** The editor stops accepting reviews of this draft: every open one is closed. Returns how many. */
  closeAllOpen(draftId: string): number {
    return Number(
      this.db
        .prepare(
          "UPDATE draft_reviews SET state = 'closed', ended_at = ? WHERE draft_id = ? AND state = 'open'",
        )
        .run(nowIso(), draftId).changes,
    )
  }

  /** How many comments the reviewer made in this review. */
  commentCount(reviewId: string): number {
    const row = this.db
      .prepare('SELECT count(*) AS n FROM draft_comments WHERE review_id = ?')
      .get(reviewId) as { n: number }
    return row.n
  }

  /** The reviewer's own reviews, newest first. */
  listFor(reviewerId: string): ReviewSummary[] {
    return this.db
      .prepare(
        `SELECT r.id, r.state, r.created_at, s.title AS draft_title, p.name AS publication_name,
                inviter.name AS inviter_name
         FROM draft_reviews r
         JOIN draft_snapshots s ON s.id = r.snapshot_id
         JOIN drafts d ON d.id = r.draft_id
         JOIN publications p ON p.id = d.publication_id
         LEFT JOIN users inviter ON inviter.id = r.invited_by
         WHERE r.reviewer_id = ?
         ORDER BY r.created_at DESC, r.rowid DESC`,
      )
      .all(reviewerId)
      .map((r) => ({
        id: r.id as string,
        draftTitle: r.draft_title as string,
        publicationName: r.publication_name as string,
        inviterName: (r.inviter_name as string | null) ?? null,
        state: r.state as ReviewState,
        createdAt: r.created_at as string,
      }))
  }

  /**
   * Per review request (a snapshot that has reviewers, or invitations still waiting): how many are reading, finished
   * or closed, how many have not answered the invitation, and what they have said. Each counts only that snapshot.
   */
  snapshotSummaries(draftId: string, now: Date = new Date()): SnapshotReviews[] {
    return this.db
      .prepare(
        `SELECT s.id, s.created_at, s.name,
                (SELECT count(*) FROM draft_reviews r WHERE r.snapshot_id = s.id AND r.state = 'open') AS open,
                (SELECT count(*) FROM draft_reviews r WHERE r.snapshot_id = s.id AND r.state = 'ended') AS ended,
                (SELECT count(*) FROM draft_reviews r WHERE r.snapshot_id = s.id AND r.state = 'closed') AS closed,
                (SELECT count(*) FROM review_invitations i
                 WHERE i.snapshot_id = s.id AND i.accepted_by IS NULL AND i.expires_at > ?) AS pending,
                (SELECT count(*) FROM draft_comments c
                 WHERE c.review_id IN (SELECT id FROM draft_reviews WHERE snapshot_id = s.id)) AS comments,
                (SELECT count(*) FROM draft_comments c
                 WHERE c.resolved_at IS NULL AND c.review_id IN (SELECT id FROM draft_reviews WHERE snapshot_id = s.id))
                  AS unresolved
         FROM draft_snapshots s
         WHERE s.draft_id = ?
           AND (EXISTS (SELECT 1 FROM draft_reviews r WHERE r.snapshot_id = s.id)
                OR EXISTS (SELECT 1 FROM review_invitations i
                           WHERE i.snapshot_id = s.id AND i.accepted_by IS NULL AND i.expires_at > ?))
         ORDER BY s.created_at, s.rowid`,
      )
      .all(now.toISOString(), draftId, now.toISOString())
      .map((r) => ({
        id: r.id as string,
        sentAt: r.created_at as string,
        name: (r.name as string | null) ?? null,
        open: r.open as number,
        ended: r.ended as number,
        closed: r.closed as number,
        pending: r.pending as number,
        comments: r.comments as number,
        unresolved: r.unresolved as number,
      }))
  }

  /** Names a review request; null (or blank) goes back to the default. False if the draft has no such snapshot. */
  renameSnapshot(draftId: string, snapshotId: string, name: string | null): boolean {
    return (
      this.db
        .prepare('UPDATE draft_snapshots SET name = ? WHERE id = ? AND draft_id = ?')
        .run(name || null, snapshotId, draftId).changes > 0
    )
  }

  /** Stops accepting the reviews of one snapshot: each that is open is closed. Returns how many. */
  closeOpenForSnapshot(draftId: string, snapshotId: string): number {
    return Number(
      this.db
        .prepare(
          `UPDATE draft_reviews SET state = 'closed', ended_at = ?
           WHERE draft_id = ? AND snapshot_id = ? AND state = 'open'`,
        )
        .run(nowIso(), draftId, snapshotId).changes,
    )
  }

  /** Who is reviewing the draft, for its editor or an owner. */
  listForDraft(draftId: string) {
    return this.db
      .prepare(
        `SELECT r.id, r.snapshot_id, r.state, s.created_at, u.name, u.email,
                (SELECT count(*) FROM draft_comments c WHERE c.review_id = r.id) AS comment_count
         FROM draft_reviews r
         JOIN users u ON u.id = r.reviewer_id
         JOIN draft_snapshots s ON s.id = r.snapshot_id
         WHERE r.draft_id = ? ORDER BY s.created_at, r.rowid`,
      )
      .all(draftId)
      .map((r) => ({
        id: r.id as string,
        snapshotId: r.snapshot_id as string,
        name: r.name as string,
        email: r.email as string,
        state: r.state as ReviewState,
        sentAt: r.created_at as string,
        commentCount: r.comment_count as number,
      }))
  }

  // -- invitations (callers pass the hash of the secret token)
  replacePending(input: {
    draftId: string
    snapshotId: string
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
        `INSERT INTO review_invitations (id, draft_id, snapshot_id, invited_by, email, token_hash, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.draftId,
        input.snapshotId,
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
        `SELECT i.*, s.title AS draft_title, p.name AS publication_name, u.name AS inviter_name
         FROM review_invitations i
         JOIN draft_snapshots s ON s.id = i.snapshot_id
         JOIN drafts d ON d.id = i.draft_id
         JOIN publications p ON p.id = d.publication_id
         JOIN users u ON u.id = i.invited_by
         WHERE i.token_hash = ?`,
      )
      .get(tokenHash)
    return (
      row && {
        id: row.id as string,
        draftId: row.draft_id as string,
        snapshotId: row.snapshot_id as string,
        draftTitle: row.draft_title as string,
        publicationName: row.publication_name as string,
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
        `SELECT id, snapshot_id, email, expires_at FROM review_invitations
         WHERE draft_id = ? AND accepted_by IS NULL AND expires_at > ? ORDER BY created_at DESC, rowid DESC`,
      )
      .all(draftId, now.toISOString())
      .map((r) => ({
        id: r.id as string,
        snapshotId: (r.snapshot_id as string | null) ?? null,
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

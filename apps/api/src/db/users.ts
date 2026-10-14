import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { firstAvailable, suggestHandle, type User } from '@lfwa/core'
import { nowIso } from './database'

export interface UserRecord {
  id: string
  /** Null for a reviewer-only account until the person chooses one. */
  handle: string | null
  reviewerOnly: boolean
  /** False while the username is one we generated and the person hasn't answered yet. */
  handleChosen: boolean
  name: string
  email: string
  emailVerified: boolean
}

/** No sign of use: no drafts or ideas, no saved API key, and no one else in any of their profiles. */
const UNUSED_ACCOUNT = `
  AND NOT EXISTS (SELECT 1 FROM profile_members m JOIN drafts d ON d.profile_id = m.profile_id
                  WHERE m.user_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM profile_members m JOIN ideas i ON i.profile_id = m.profile_id
                  WHERE m.user_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM llm_credentials c WHERE c.user_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM profile_members m JOIN profile_members o
                    ON o.profile_id = m.profile_id AND o.user_id <> m.user_id
                  WHERE m.user_id = u.id)`

export class UserStore {
  constructor(private readonly db: DatabaseSync) {}

  /**
   * Uses the chosen handle (the unique index rejects a duplicate), or, for sign-ups that didn't
   * pick one (e.g. via Google), derives one from the name and makes it unique. Call inside a
   * transaction so two sign-ups can't pick the same one.
   */
  create(input: {
    name: string
    email: string
    emailVerified: boolean
    handle?: string
    /** No username and no profile: the account can only review (#157). */
    reviewerOnly?: boolean
  }): UserRecord {
    const id = randomUUID()
    const reviewerOnly = input.reviewerOnly === true
    const handle = reviewerOnly
      ? null
      : (input.handle ??
        firstAvailable(suggestHandle(input.name, input.email), (h) => this.handleTaken(h)))
    this.db
      .prepare(
        `INSERT INTO users (id, handle, handle_chosen, reviewer_only, name, email, email_verified, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        handle,
        input.handle === undefined ? 0 : 1,
        reviewerOnly ? 1 : 0,
        input.name,
        input.email,
        input.emailVerified ? 1 : 0,
        nowIso(),
      )
    return {
      id,
      handle,
      reviewerOnly,
      handleChosen: input.handle !== undefined,
      name: input.name,
      email: input.email,
      emailVerified: input.emailVerified,
    }
  }

  /** Whether someone else has it: in use, or kept for the person who used to have it. */
  handleTaken(handle: string, exceptUserId?: string): boolean {
    const owner = this.db.prepare('SELECT id FROM users WHERE handle = ?').get(handle) as
      { id: string } | undefined
    if (owner) return owner.id !== exceptUserId
    const retired = this.db
      .prepare('SELECT user_id FROM retired_handles WHERE handle = ?')
      .get(handle) as { user_id: string } | undefined
    return retired !== undefined && retired.user_id !== exceptUserId
  }

  /**
   * Gives the user this username and records that they chose it. Their old one is kept for them
   * (see `retired_handles`). Call inside a transaction, after checking `handleTaken`.
   */
  setHandle(id: string, handle: string, current: string | null) {
    if (current && handle !== current) {
      this.db
        .prepare(
          'INSERT OR IGNORE INTO retired_handles (handle, user_id, retired_at) VALUES (?, ?, ?)',
        )
        .run(current, id, nowIso())
      this.db.prepare('DELETE FROM retired_handles WHERE handle = ?').run(handle)
    }
    this.db
      .prepare('UPDATE users SET handle = ?, handle_chosen = 1, reviewer_only = 0 WHERE id = ?')
      .run(handle, id)
  }

  findById(id: string): UserRecord | undefined {
    return this.one(this.db.prepare('SELECT * FROM users WHERE id = ?').get(id))
  }

  findByEmail(email: string): UserRecord | undefined {
    return this.one(this.db.prepare('SELECT * FROM users WHERE email = ?').get(email))
  }

  /**
   * Accounts that never confirmed their email, are older than `cutoff`, and show no sign of use: no
   * drafts or ideas in any of their profiles, no saved API key, and no one else in their profiles.
   */
  findStaleUnconfirmed(cutoff: Date, limit: number): UserRecord[] {
    return this.db
      .prepare(
        `SELECT u.* FROM users u
         WHERE u.email_verified = 0 AND u.created_at < ? ${UNUSED_ACCOUNT}
         ORDER BY u.created_at
         LIMIT ?`,
      )
      .all(cutoff.toISOString(), limit)
      .map((row) => this.one(row)!)
  }

  /**
   * Unused, unconfirmed accounts created in `[notBefore, before)` that haven't been warned yet: those
   * that are close to deletion but not yet past it.
   */
  findNeedingDeletionReminder(before: Date, notBefore: Date, limit: number): UserRecord[] {
    return this.db
      .prepare(
        `SELECT u.* FROM users u
         WHERE u.email_verified = 0 AND u.deletion_reminded_at IS NULL
           AND u.created_at < ? AND u.created_at >= ? ${UNUSED_ACCOUNT}
         ORDER BY u.created_at
         LIMIT ?`,
      )
      .all(before.toISOString(), notBefore.toISOString(), limit)
      .map((row) => this.one(row)!)
  }

  markDeletionReminded(id: string, at: Date) {
    this.db
      .prepare('UPDATE users SET deletion_reminded_at = ? WHERE id = ?')
      .run(at.toISOString(), id)
  }

  /** When the account was created, to work out how long it has left. */
  createdAt(id: string): Date | undefined {
    const row = this.db.prepare('SELECT created_at FROM users WHERE id = ?').get(id) as
      { created_at: string } | undefined
    return row && new Date(row.created_at)
  }

  setName(id: string, name: string) {
    this.db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, id)
  }

  /** The account becomes a full one (invited to a profile, or the person chose to start writing). */
  clearReviewerOnly(id: string) {
    this.db.prepare('UPDATE users SET reviewer_only = 0 WHERE id = ?').run(id)
  }

  /** The username was one we generated, so the app asks once whether the person would like another. */
  clearHandleChosen(id: string) {
    this.db.prepare('UPDATE users SET handle_chosen = 0 WHERE id = ?').run(id)
  }

  markEmailVerified(id: string) {
    this.db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(id)
  }

  /** Switches the address. Only call once the new inbox has been proven, hence verified. */
  setVerifiedEmail(id: string, email: string) {
    this.db.prepare('UPDATE users SET email = ?, email_verified = 1 WHERE id = ?').run(email, id)
  }

  /**
   * Copies the person's display name (never the email or handle) onto what they contributed, in the rows that
   * would otherwise lose their author when the account goes. Call just before `delete`.
   */
  keepNameOnContributions(id: string, name: string) {
    const set = (table: string, column: string, by: string) =>
      this.db.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${by} = ?`).run(name, id)
    set('idea_notes', 'kept_name', 'created_by')
    set('idea_messages', 'kept_name', 'author_id')
    set('idea_research', 'kept_name', 'created_by')
    set('draft_insertions', 'kept_note_author_name', 'note_author_id')
    set('draft_insertions', 'kept_inserted_by_name', 'inserted_by')
    set('draft_handovers', 'kept_actor_name', 'actor_id')
    set('draft_handovers', 'kept_member_name', 'member_id')
    set('draft_comments', 'kept_name', 'author_id')
  }

  delete(id: string) {
    this.db.prepare('DELETE FROM users WHERE id = ?').run(id)
  }

  /** The user as exposed to the client. */
  toPublic(user: UserRecord): User {
    return {
      id: user.id,
      handle: user.handle,
      reviewerOnly: user.reviewerOnly,
      handleChosen: user.handleChosen,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      hasPassword: this.getPasswordHash(user.id) !== undefined,
      linkedProviders: this.listProviders(user.id),
    }
  }

  // -- password credential
  getPasswordHash(userId: string): string | undefined {
    const row = this.db
      .prepare('SELECT hash FROM password_credentials WHERE user_id = ?')
      .get(userId) as { hash: string } | undefined
    return row?.hash
  }

  setPasswordHash(userId: string, hash: string) {
    this.db
      .prepare(
        `INSERT INTO password_credentials (user_id, hash, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET hash = excluded.hash, updated_at = excluded.updated_at`,
      )
      .run(userId, hash, nowIso())
  }

  removePassword(userId: string) {
    this.db.prepare('DELETE FROM password_credentials WHERE user_id = ?').run(userId)
  }

  // -- external identities
  findByIdentity(provider: string, subject: string): UserRecord | undefined {
    return this.one(
      this.db
        .prepare(
          `SELECT u.* FROM users u JOIN identities i ON i.user_id = u.id
           WHERE i.provider = ? AND i.subject = ?`,
        )
        .get(provider, subject),
    )
  }

  linkIdentity(userId: string, provider: string, subject: string) {
    this.db
      .prepare(
        'INSERT INTO identities (provider, subject, user_id, created_at) VALUES (?, ?, ?, ?)',
      )
      .run(provider, subject, userId, nowIso())
  }

  listProviders(userId: string): string[] {
    return (
      this.db
        .prepare('SELECT provider FROM identities WHERE user_id = ? ORDER BY provider')
        .all(userId) as { provider: string }[]
    ).map((r) => r.provider)
  }

  private one(row: unknown): UserRecord | undefined {
    if (!row) return undefined
    const r = row as Record<string, unknown>
    return {
      id: r.id as string,
      handle: (r.handle as string | null) ?? null,
      reviewerOnly: r.reviewer_only === 1,
      handleChosen: r.handle_chosen === 1,
      name: r.name as string,
      email: r.email as string,
      emailVerified: r.email_verified === 1,
    }
  }
}

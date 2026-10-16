import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { nowIso } from './database'

/** "Last used" is only rewritten when it is this old. */
const LAST_USED_GRANULARITY_MS = 60 * 60 * 1000

/** What every emailed one-time link records about itself, however its row is laid out. */
const linkFields = (row: Record<string, unknown>) => ({
  userId: row.user_id as string,
  expiresAt: new Date(row.expires_at as string),
  used: row.used_at !== null,
})

/** Sessions and the emailed one-time links (password reset, email confirmation, email change). Callers pass in the *hash* of the secret token. */
export class TokenStore {
  constructor(private readonly db: DatabaseSync) {}

  // -- sessions
  createSession(
    tokenHash: string,
    userId: string,
    expiresAt: Date,
    deviceLabel: string | null = null,
  ) {
    const now = nowIso()
    this.db
      .prepare(
        `INSERT INTO sessions (token_hash, id, user_id, created_at, expires_at, device_label, last_used_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(tokenHash, randomUUID(), userId, now, expiresAt.toISOString(), deviceLabel, now)
  }

  /**
   * Returns the owning user id if the session exists and hasn't expired. "Last used" moves on at most once an
   * hour, so ordinary requests don't write.
   */
  findSessionUser(tokenHash: string, now: Date): string | undefined {
    const row = this.db
      .prepare('SELECT user_id, last_used_at FROM sessions WHERE token_hash = ? AND expires_at > ?')
      .get(tokenHash, now.toISOString()) as { user_id: string; last_used_at: string } | undefined
    if (!row) return undefined
    if (now.getTime() - Date.parse(row.last_used_at) >= LAST_USED_GRANULARITY_MS) {
      this.db
        .prepare('UPDATE sessions SET last_used_at = ? WHERE token_hash = ?')
        .run(now.toISOString(), tokenHash)
    }
    return row.user_id
  }

  /** The person's sessions that still work, most recently used first. */
  listSessions(userId: string, now: Date) {
    const rows = this.db
      .prepare(
        `SELECT id, token_hash, device_label, last_used_at FROM sessions
         WHERE user_id = ? AND expires_at > ? ORDER BY last_used_at DESC`,
      )
      .all(userId, now.toISOString())
    return rows.map((r) => ({
      id: r.id as string,
      tokenHash: r.token_hash as string,
      deviceLabel: (r.device_label as string | null) ?? null,
      lastUsedAt: r.last_used_at as string,
    }))
  }

  /** Ends one of this person's sessions by its public id. Returns false if they have no such session. */
  deleteUserSessionById(userId: string, id: string): boolean {
    return (
      Number(
        this.db.prepare('DELETE FROM sessions WHERE user_id = ? AND id = ?').run(userId, id)
          .changes,
      ) > 0
    )
  }

  deleteSession(tokenHash: string) {
    this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash)
  }

  deleteUserSessions(userId: string) {
    this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
  }

  /** Signs out every device except the one making the request. */
  deleteUserSessionsExcept(userId: string, keepTokenHash: string) {
    this.db
      .prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?')
      .run(userId, keepTokenHash)
  }

  /** Drops sessions and links that can no longer be used. Returns how many of each were removed. */
  deleteExpired(now: Date) {
    const at = now.toISOString()
    const count = (sql: string) => Number(this.db.prepare(sql).run(at).changes)
    return {
      sessions: count('DELETE FROM sessions WHERE expires_at <= ?'),
      passwordResets: count(
        'DELETE FROM password_resets WHERE expires_at <= ? OR used_at IS NOT NULL',
      ),
      emailVerifications: count(
        'DELETE FROM email_verifications WHERE expires_at <= ? OR used_at IS NOT NULL',
      ),
      emailChanges: count('DELETE FROM email_changes WHERE expires_at <= ? OR used_at IS NOT NULL'),
      emailChangeUndos: count(
        'DELETE FROM email_change_undos WHERE expires_at <= ? OR used_at IS NOT NULL',
      ),
    }
  }

  // -- password resets
  createReset(tokenHash: string, userId: string, expiresAt: Date) {
    // Only the most recent link should work.
    this.db.prepare('DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL').run(userId)
    this.db
      .prepare('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
      .run(tokenHash, userId, expiresAt.toISOString())
  }

  /** Returns the user id for a valid (unused, unexpired) reset token. */
  findValidReset(tokenHash: string, now: Date): string | undefined {
    const row = this.db
      .prepare(
        'SELECT user_id FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?',
      )
      .get(tokenHash, now.toISOString()) as { user_id: string } | undefined
    return row?.user_id
  }

  /** Cancels any outstanding "reset your password" links. */
  deleteUserResets(userId: string) {
    this.db.prepare('DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL').run(userId)
  }

  markResetUsed(tokenHash: string) {
    this.db
      .prepare('UPDATE password_resets SET used_at = ? WHERE token_hash = ?')
      .run(nowIso(), tokenHash)
  }

  // -- email verification
  createVerification(tokenHash: string, userId: string, email: string, expiresAt: Date) {
    // Only the most recent link should work.
    this.db
      .prepare('DELETE FROM email_verifications WHERE user_id = ? AND used_at IS NULL')
      .run(userId)
    this.db
      .prepare(
        'INSERT INTO email_verifications (token_hash, user_id, email, expires_at) VALUES (?, ?, ?, ?)',
      )
      .run(tokenHash, userId, email, expiresAt.toISOString())
  }

  findVerification(tokenHash: string) {
    const row = this.db
      .prepare(
        'SELECT user_id, email, expires_at, used_at FROM email_verifications WHERE token_hash = ?',
      )
      .get(tokenHash)
    return row && { ...linkFields(row), email: row.email as string }
  }

  markVerificationUsed(tokenHash: string) {
    this.db
      .prepare('UPDATE email_verifications SET used_at = ? WHERE token_hash = ?')
      .run(nowIso(), tokenHash)
  }

  /** Cancels any outstanding "confirm your email" links (they were sent to the old address). */
  deleteUserVerifications(userId: string) {
    this.db.prepare('DELETE FROM email_verifications WHERE user_id = ?').run(userId)
  }

  // -- email address changes
  createEmailChange(tokenHash: string, userId: string, newEmail: string, expiresAt: Date) {
    // Only the most recent request should work.
    this.deleteUserEmailChanges(userId)
    this.db
      .prepare(
        'INSERT INTO email_changes (token_hash, user_id, new_email, expires_at) VALUES (?, ?, ?, ?)',
      )
      .run(tokenHash, userId, newEmail, expiresAt.toISOString())
  }

  findEmailChange(tokenHash: string) {
    const row = this.db
      .prepare(
        'SELECT user_id, new_email, expires_at, used_at FROM email_changes WHERE token_hash = ?',
      )
      .get(tokenHash)
    return row && { ...linkFields(row), newEmail: row.new_email as string }
  }

  markEmailChangeUsed(tokenHash: string) {
    this.db
      .prepare('UPDATE email_changes SET used_at = ? WHERE token_hash = ?')
      .run(nowIso(), tokenHash)
  }

  /** Cancels a pending change that hasn't been confirmed yet. */
  deleteUserEmailChanges(userId: string) {
    this.db.prepare('DELETE FROM email_changes WHERE user_id = ? AND used_at IS NULL').run(userId)
  }

  // -- undoing an email change
  createEmailChangeUndo(
    tokenHash: string,
    userId: string,
    oldEmail: string,
    newEmail: string,
    expiresAt: Date,
  ) {
    this.db
      .prepare(
        'INSERT INTO email_change_undos (token_hash, user_id, old_email, new_email, expires_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(tokenHash, userId, oldEmail, newEmail, expiresAt.toISOString())
  }

  findEmailChangeUndo(tokenHash: string) {
    const row = this.db
      .prepare(
        'SELECT user_id, old_email, new_email, expires_at, used_at FROM email_change_undos WHERE token_hash = ?',
      )
      .get(tokenHash)
    return (
      row && {
        ...linkFields(row),
        oldEmail: row.old_email as string,
        newEmail: row.new_email as string,
      }
    )
  }

  markEmailChangeUndoUsed(tokenHash: string) {
    this.db
      .prepare('UPDATE email_change_undos SET used_at = ? WHERE token_hash = ?')
      .run(nowIso(), tokenHash)
  }
}

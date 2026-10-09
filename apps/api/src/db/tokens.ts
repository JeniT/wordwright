import type { DatabaseSync } from 'node:sqlite'
import { nowIso } from './database'

/** Sessions and password-reset tokens. Callers pass in the *hash* of the secret token. */
export class TokenStore {
  constructor(private readonly db: DatabaseSync) {}

  // -- sessions
  createSession(tokenHash: string, userId: string, expiresAt: Date) {
    this.db
      .prepare(
        'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
      )
      .run(tokenHash, userId, nowIso(), expiresAt.toISOString())
  }

  /** Returns the owning user id if the session exists and hasn't expired. */
  findSessionUser(tokenHash: string, now: Date): string | undefined {
    const row = this.db
      .prepare('SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?')
      .get(tokenHash, now.toISOString()) as { user_id: string } | undefined
    return row?.user_id
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

  deleteExpiredSessions(now: Date) {
    this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now.toISOString())
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

  findVerification(
    tokenHash: string,
  ): { userId: string; email: string; expiresAt: Date; used: boolean } | undefined {
    const row = this.db
      .prepare(
        'SELECT user_id, email, expires_at, used_at FROM email_verifications WHERE token_hash = ?',
      )
      .get(tokenHash) as
      { user_id: string; email: string; expires_at: string; used_at: string | null } | undefined
    return (
      row && {
        userId: row.user_id,
        email: row.email,
        expiresAt: new Date(row.expires_at),
        used: row.used_at !== null,
      }
    )
  }

  markVerificationUsed(tokenHash: string) {
    this.db
      .prepare('UPDATE email_verifications SET used_at = ? WHERE token_hash = ?')
      .run(nowIso(), tokenHash)
  }
}

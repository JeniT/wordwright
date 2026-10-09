import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { firstAvailable, suggestHandle, type User } from '@lfwa/core'
import { nowIso } from './database'

export interface UserRecord {
  id: string
  handle: string
  name: string
  email: string
  emailVerified: boolean
}

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
  }): UserRecord {
    const id = randomUUID()
    const handle =
      input.handle ??
      firstAvailable(suggestHandle(input.name, input.email), (h) => this.handleTaken(h))
    this.db
      .prepare(
        'INSERT INTO users (id, handle, name, email, email_verified, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(id, handle, input.name, input.email, input.emailVerified ? 1 : 0, nowIso())
    return { id, handle, name: input.name, email: input.email, emailVerified: input.emailVerified }
  }

  handleTaken(handle: string): boolean {
    return this.db.prepare('SELECT 1 FROM users WHERE handle = ?').get(handle) !== undefined
  }

  findById(id: string): UserRecord | undefined {
    return this.one(this.db.prepare('SELECT * FROM users WHERE id = ?').get(id))
  }

  findByEmail(email: string): UserRecord | undefined {
    return this.one(this.db.prepare('SELECT * FROM users WHERE email = ?').get(email))
  }

  /**
   * Accounts that never confirmed their email, are older than `cutoff`, and show no sign of use: no
   * drafts in any of their profiles, no saved API key, and no one else in their profiles.
   */
  findStaleUnconfirmed(cutoff: Date, limit: number): UserRecord[] {
    return this.db
      .prepare(
        `SELECT u.* FROM users u
         WHERE u.email_verified = 0 AND u.created_at < ?
           AND NOT EXISTS (SELECT 1 FROM profile_members m JOIN drafts d ON d.profile_id = m.profile_id
                           WHERE m.user_id = u.id)
           AND NOT EXISTS (SELECT 1 FROM llm_credentials c WHERE c.user_id = u.id)
           AND NOT EXISTS (SELECT 1 FROM profile_members m JOIN profile_members o
                             ON o.profile_id = m.profile_id AND o.user_id <> m.user_id
                           WHERE m.user_id = u.id)
         ORDER BY u.created_at
         LIMIT ?`,
      )
      .all(cutoff.toISOString(), limit)
      .map((row) => this.one(row)!)
  }

  markEmailVerified(id: string) {
    this.db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(id)
  }

  /** Switches the address. Only call once the new inbox has been proven, hence verified. */
  setVerifiedEmail(id: string, email: string) {
    this.db.prepare('UPDATE users SET email = ?, email_verified = 1 WHERE id = ?').run(email, id)
  }

  delete(id: string) {
    this.db.prepare('DELETE FROM users WHERE id = ?').run(id)
  }

  /** The user as exposed to the client. */
  toPublic(user: UserRecord): User {
    return {
      id: user.id,
      handle: user.handle,
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
      handle: r.handle as string,
      name: r.name as string,
      email: r.email as string,
      emailVerified: r.email_verified === 1,
    }
  }
}

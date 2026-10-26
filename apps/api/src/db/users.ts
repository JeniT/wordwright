import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import {
  firstAvailable,
  suggestHandle,
  type AdminAccount,
  type Approval,
  type User,
} from '@wordwright/core'
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
  /** Only `approved` accounts reach the app (#328). */
  approval: Approval
  /** Set from `ADMIN_EMAILS` or the admin command; always checked together with a confirmed address. */
  isAdmin: boolean
}

/**
 * Every column that can hold a display name kept at account deletion (#153), and the column that said who the row was
 * by. One list for keeping a name and for taking it back, so a new column cannot be added to one and forgotten in the other.
 */
const KEPT_NAME_COLUMNS = [
  { table: 'idea_notes', column: 'kept_name', by: 'created_by' },
  { table: 'idea_messages', column: 'kept_name', by: 'author_id' },
  { table: 'idea_research', column: 'kept_name', by: 'created_by' },
  { table: 'draft_insertions', column: 'kept_note_author_name', by: 'note_author_id' },
  { table: 'draft_insertions', column: 'kept_inserted_by_name', by: 'inserted_by' },
  { table: 'draft_handovers', column: 'kept_actor_name', by: 'actor_id' },
  { table: 'draft_handovers', column: 'kept_member_name', by: 'member_id' },
  { table: 'draft_comments', column: 'kept_name', by: 'author_id' },
  { table: 'draft_reviews', column: 'kept_inviter_name', by: 'invited_by' },
  { table: 'idea_proposals', column: 'kept_decided_by_name', by: 'decided_by' },
] as const

/** No sign of use: no drafts or ideas, no saved API key, and no one else in any of their publications. */
const UNUSED_ACCOUNT = `
  AND NOT EXISTS (SELECT 1 FROM publication_members m JOIN drafts d ON d.publication_id = m.publication_id
                  WHERE m.user_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM publication_members m JOIN ideas i ON i.publication_id = m.publication_id
                  WHERE m.user_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM llm_credentials c WHERE c.user_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM publication_members m JOIN publication_members o
                    ON o.publication_id = m.publication_id AND o.user_id <> m.user_id
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
    /** No username and no publication: the account can only review (#157). */
    reviewerOnly?: boolean
    /** Whether the owner has let them in. Defaults to waiting: the caller says when it is not. */
    approval?: Approval
  }): UserRecord {
    const approval = input.approval ?? 'waiting'
    const id = randomUUID()
    const reviewerOnly = input.reviewerOnly === true
    const handle = reviewerOnly
      ? null
      : (input.handle ??
        firstAvailable(suggestHandle(input.name, input.email), (h) => this.handleTaken(h)))
    this.db
      .prepare(
        `INSERT INTO users (id, handle, handle_chosen, reviewer_only, name, email, email_verified, created_at, approval)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        approval,
      )
    // Tutorial mode is on for every new full account (#198); a reviewer-only one gets it when it becomes one.
    if (!reviewerOnly) this.turnTutorialOn(id)
    return {
      id,
      handle,
      reviewerOnly,
      handleChosen: input.handle !== undefined,
      name: input.name,
      email: input.email,
      emailVerified: input.emailVerified,
      approval,
      isAdmin: false,
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

  /** Same database as `UserSettingsStore`, written here so the account and its first setting are made together. */
  private turnTutorialOn(id: string) {
    this.db
      .prepare(
        `INSERT INTO user_settings (user_id, tutorial_mode, updated_at) VALUES (?, 1, ?)
         ON CONFLICT(user_id) DO UPDATE SET tutorial_mode = 1, updated_at = excluded.updated_at`,
      )
      .run(id, nowIso())
  }

  /**
   * Gives the user this username and records that they chose it. Their old one is kept for them
   * (see `retired_handles`). Call inside a transaction, after checking `handleTaken`.
   * A reviewer-only account becomes a full one here, and a full account starts with tutorial mode on (#198).
   */
  setHandle(id: string, handle: string, current: string | null) {
    const wasReviewer = (
      this.db.prepare('SELECT reviewer_only FROM users WHERE id = ?').get(id) as
        { reviewer_only: number } | undefined
    )?.reviewer_only
    if (wasReviewer === 1) this.turnTutorialOn(id)
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

  private tutorialModeOn(id: string): boolean {
    const row = this.db
      .prepare('SELECT tutorial_mode FROM user_settings WHERE user_id = ?')
      .get(id) as { tutorial_mode: number | null } | undefined
    return row?.tutorial_mode === 1
  }

  findById(id: string): UserRecord | undefined {
    return this.one(this.db.prepare('SELECT * FROM users WHERE id = ?').get(id))
  }

  findByEmail(email: string): UserRecord | undefined {
    return this.one(this.db.prepare('SELECT * FROM users WHERE email = ?').get(email))
  }

  /**
   * Accounts that never confirmed their email, are older than `cutoff`, and show no sign of use: no
   * drafts or ideas in any of their publications, no saved API key, and no one else in their publications.
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

  /** The account becomes a full one (invited to a publication, or the person chose to start writing). */
  clearReviewerOnly(id: string) {
    this.db.prepare('UPDATE users SET reviewer_only = 0 WHERE id = ?').run(id)
    this.turnTutorialOn(id) // a new full account, as in `setHandle` (#198)
  }

  /** The username was one we generated, so the app asks once whether the person would like another. */
  clearHandleChosen(id: string) {
    this.db.prepare('UPDATE users SET handle_chosen = 0 WHERE id = ?').run(id)
  }

  markEmailVerified(id: string) {
    this.db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(id)
  }

  /**
   * Switches the address. Only call once the new inbox has been proven, hence verified. Admin goes with the address
   * it was given for, so a new one has to earn it again (`ADMIN_EMAILS`, or the command).
   */
  setVerifiedEmail(id: string, email: string) {
    this.db
      .prepare('UPDATE users SET email = ?, email_verified = 1, is_admin = 0 WHERE id = ?')
      .run(email, id)
  }

  setApproval(id: string, approval: Approval) {
    this.db.prepare('UPDATE users SET approval = ? WHERE id = ?').run(approval, id)
  }

  /** Called only from the server's settings or the admin command (#328); there is no route that reaches it. */
  setAdmin(id: string, isAdmin: boolean) {
    this.db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(isAdmin ? 1 : 0, id)
  }

  /**
   * What an admin may see of accounts: who they are and where they stand, nothing they wrote. Reviewer-only
   * accounts are included, since they are people too.
   */
  listForAdmin(): AdminAccount[] {
    return (
      this.db
        .prepare(
          'SELECT id, name, email, email_verified, created_at, approval, is_admin FROM users ORDER BY created_at DESC, rowid DESC',
        )
        .all() as Record<string, unknown>[]
    ).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      email: r.email as string,
      emailVerified: r.email_verified === 1,
      createdAt: r.created_at as string,
      approval: r.approval as Approval,
      isAdmin: r.is_admin === 1,
    }))
  }

  /**
   * Copies the person's display name (never the email or handle) onto what they contributed, in the rows that
   * would otherwise lose their author when the account goes. Call just before `delete`.
   */
  keepNameOnContributions(id: string, name: string) {
    for (const { table, column, by } of KEPT_NAME_COLUMNS) {
      this.db.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${by} = ?`).run(name, id)
    }
  }

  /**
   * Clears a kept display name wherever it is held, on the request of the person it was (#411). Their rows then read as
   * "a former member". Matches the whole name exactly, so it also clears another person who kept the same name: the
   * caller shows `countKeptName` first. Returns the number of rows changed.
   */
  forgetKeptName(name: string): number {
    let changed = 0
    for (const { table, column } of KEPT_NAME_COLUMNS) {
      const result = this.db
        .prepare(`UPDATE ${table} SET ${column} = NULL WHERE ${column} = ?`)
        .run(name)
      changed += Number(result.changes)
    }
    return changed
  }

  /** How many rows hold this kept name, by table, for `forgetKeptName` to be checked before it is run. */
  countKeptName(name: string): Record<string, number> {
    const counts: Record<string, number> = {}
    for (const { table, column } of KEPT_NAME_COLUMNS) {
      const row = this.db
        .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = ?`)
        .get(name) as { n: number }
      counts[`${table}.${column}`] = row.n
    }
    return counts
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
      tutorialMode: !user.reviewerOnly && this.tutorialModeOn(user.id),
      approval: user.approval,
      isAdmin: user.isAdmin && user.emailVerified,
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
      approval: r.approval as Approval,
      isAdmin: r.is_admin === 1,
    }
  }
}

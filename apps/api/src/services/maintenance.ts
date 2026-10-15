import type { Store } from '../db/store'
import type { UserRecord } from '../db/users'
import { removeUserAndOwnedData } from './remove-user'

/** Signups that never confirm their email and are never used are removed after this long. */
export const DEFAULT_UNCONFIRMED_TTL_DAYS = 14
const DAY_MS = 24 * 60 * 60 * 1000
/** Accepted invitations are kept this long so that re-opening the link stays harmless. */
const ACCEPTED_INVITATION_KEEP_DAYS = 30
/** How long before deletion an unconfirmed account is warned (shorter for very short limits). */
const REMINDER_LEAD_DAYS = 3
const BATCH = 100
const MAX_BATCHES_PER_RUN = 50

export interface MaintenanceDeps {
  store: Store
  /** 0 turns the cleanup of unconfirmed accounts off. */
  unconfirmedTtlDays?: number
  /** Sends the warning email before deletion; without it, no warnings are sent. */
  reminders?: { sendDeletionReminder(user: UserRecord, daysLeft: number): void }
  now?: () => Date
  logger?: Pick<Console, 'log' | 'error'>
}

export interface MaintenanceResult {
  purgedAccounts: number
  remindedAccounts: number
  expiredSessions: number
  expiredLinks: number
}

/** Periodic housekeeping: forget abandoned signups and expired sessions/links. Safe to run repeatedly. */
export class MaintenanceService {
  private readonly now: () => Date
  private readonly ttlDays: number

  constructor(private readonly d: MaintenanceDeps) {
    this.now = d.now ?? (() => new Date())
    this.ttlDays = d.unconfirmedTtlDays ?? DEFAULT_UNCONFIRMED_TTL_DAYS
  }

  /**
   * Deletes accounts that never confirmed their email, are older than the limit and show no sign of
   * use (no drafts, no saved API key, nobody else in their publications). This frees addresses taken by
   * typos or abandoned signups. Deletion is the same as when someone deletes their own account.
   */
  purgeUnconfirmedAccounts(): number {
    if (this.ttlDays <= 0) return 0
    const { store } = this.d
    const cutoff = new Date(this.now().getTime() - this.ttlDays * DAY_MS)
    let purged = 0
    for (let i = 0; i < MAX_BATCHES_PER_RUN; i++) {
      const batch = store.users.findStaleUnconfirmed(cutoff, BATCH)
      if (batch.length === 0) break
      for (const user of batch) store.transaction(() => removeUserAndOwnedData(store, user))
      purged += batch.length
    }
    return purged
  }

  /**
   * Once, a few days before an unconfirmed, unused account would be deleted, emails its owner so a
   * late confirmer isn't surprised. Only accounts still inside the warning window are warned, so
   * ones already past the limit are simply deleted. Marked as warned even if the mail later fails
   * to send (delivery is in the background and logged), so nobody is mailed twice.
   */
  remindUnconfirmedAccounts(): number {
    const { store, reminders } = this.d
    if (this.ttlDays <= 0 || !reminders) return 0
    const now = this.now()
    const leadDays = Math.min(REMINDER_LEAD_DAYS, this.ttlDays / 2)
    const before = new Date(now.getTime() - (this.ttlDays - leadDays) * DAY_MS)
    const notBefore = new Date(now.getTime() - this.ttlDays * DAY_MS)
    let reminded = 0
    for (let i = 0; i < MAX_BATCHES_PER_RUN; i++) {
      const batch = store.users.findNeedingDeletionReminder(before, notBefore, BATCH)
      if (batch.length === 0) break
      for (const user of batch) {
        const created = store.users.createdAt(user.id) ?? now
        const deleteAt = created.getTime() + this.ttlDays * DAY_MS
        const daysLeft = Math.max(1, Math.ceil((deleteAt - now.getTime()) / DAY_MS))
        store.users.markDeletionReminded(user.id, now)
        reminders.sendDeletionReminder(user, daysLeft)
      }
      reminded += batch.length
    }
    return reminded
  }

  /** Removes sessions, reset/verification links and invitations that can no longer be used. */
  pruneExpired(): Pick<MaintenanceResult, 'expiredSessions' | 'expiredLinks'> {
    const { store } = this.d
    const now = this.now()
    const tokens = store.tokens.deleteExpired(now)
    const invitations = store.invitations.deleteExpired(
      now,
      new Date(now.getTime() - ACCEPTED_INVITATION_KEEP_DAYS * DAY_MS),
    )
    return {
      expiredSessions: tokens.sessions,
      expiredLinks:
        tokens.passwordResets +
        tokens.emailVerifications +
        tokens.emailChanges +
        tokens.emailChangeUndos +
        invitations,
    }
  }

  /** One housekeeping pass. Logs counts only, never who was removed. */
  run(): MaintenanceResult {
    // Delete first, so an account that is already past the limit is never sent a warning.
    const result = {
      purgedAccounts: this.purgeUnconfirmedAccounts(),
      remindedAccounts: this.remindUnconfirmedAccounts(),
      ...this.pruneExpired(),
    }
    if (
      result.purgedAccounts ||
      result.remindedAccounts ||
      result.expiredSessions ||
      result.expiredLinks
    ) {
      ;(this.d.logger ?? console).log(
        `Maintenance: removed ${result.purgedAccounts} unused unconfirmed account(s), warned ${result.remindedAccounts}, ${result.expiredSessions} expired session(s), ${result.expiredLinks} expired link(s)`,
      )
    }
    return result
  }
}

export interface MaintenanceSchedule {
  run: () => unknown
  intervalMs: number
  /** Wait before the first run so startup isn't slowed. */
  initialDelayMs?: number
  logger?: Pick<Console, 'error'>
}

/**
 * Runs `run` shortly after start and then every `intervalMs`. A failure is logged and the next run
 * still happens; runs never overlap; and the timers don't keep the process alive.
 */
export function startMaintenance({
  run,
  intervalMs,
  initialDelayMs = 10_000,
  logger = console,
}: MaintenanceSchedule) {
  let running = false
  const tick = () => {
    if (running) return
    running = true
    try {
      run()
    } catch (err) {
      logger.error(
        `Maintenance run failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      )
    } finally {
      running = false
    }
  }
  const first = setTimeout(tick, initialDelayMs)
  const every = setInterval(tick, intervalMs)
  first.unref()
  every.unref()
  return {
    stop() {
      clearTimeout(first)
      clearInterval(every)
    },
  }
}

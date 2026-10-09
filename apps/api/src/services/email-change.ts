import { generateToken, hashToken } from '../auth/secrets'
import type { PasswordHasher } from '../auth/password'
import type { Store } from '../db/store'
import type { UserRecord } from '../db/users'
import { sendInBackground } from '../mail/background'
import type { Mailer } from '../mail/mailer'
import { changeEmailEmail, emailChangedEmail, passwordResetEmail } from '../mail/templates'
import {
  AccountError,
  emailInUse,
  isUniqueViolation,
  RESET_TTL_MS,
  VERIFY_TTL_MS,
} from './accounts'

const DAY_MS = 24 * 60 * 60 * 1000
export const UNDO_EMAIL_CHANGE_TTL_DAYS = 7

export interface EmailChangeServiceDeps {
  store: Store
  hasher: PasswordHasher
  mailer: Mailer
  /** Origin the web app is served from; used in emailed links. */
  publicUrl: string
  now?: () => Date
  /** Where delivery failures are reported. */
  logger?: Pick<Console, 'error'>
}

/**
 * Changing the address an account signs in with: ask (emails the *new* address), confirm (opens the
 * link), and undo ("this wasn't me"). Split from `AccountService` because the three steps only make
 * sense together, and each is security-sensitive enough to read on its own.
 */
export class EmailChangeService {
  private readonly now: () => Date

  constructor(private readonly d: EmailChangeServiceDeps) {
    this.now = d.now ?? (() => new Date())
  }

  /**
   * Starts a change of address: emails a link to the *new* address, and switches nothing until it is
   * opened, so a typo can't lock anyone out. The password is re-checked, as for changing it, so a
   * stolen session alone can't redirect the account's email. Accounts with no password can't change
   * it (the session would be the only proof); they add a password first.
   */
  async request(user: UserRecord, newEmail: string, password: string): Promise<void> {
    const { store, hasher } = this.d
    const hash = store.users.getPasswordHash(user.id)
    if (!hash) {
      throw new AccountError(
        'password_required',
        'Add a password to your account first; then you can change your email address.',
      )
    }
    if (!(await hasher.verify(password, hash))) {
      throw new AccountError('confirmation_failed', 'Your password is incorrect')
    }
    if (newEmail === user.email) {
      throw new AccountError('email_unchanged', 'That is already your email address')
    }
    if (store.users.findByEmail(newEmail)) throw emailInUse()
    const token = generateToken()
    store.tokens.createEmailChange(
      hashToken(token),
      user.id,
      newEmail,
      this.expiresIn(VERIFY_TTL_MS),
    )
    this.sendInBackground(user.id, 'email change', {
      to: newEmail,
      ...changeEmailEmail({
        name: user.name,
        link: `${this.d.publicUrl}/confirm-email-change?token=${token}`,
        ttlHours: VERIFY_TTL_MS / 3_600_000,
      }),
    })
  }

  /**
   * Completes the change. Works signed in or not (people open the link on their phone); the link
   * only proves the new inbox, and the password was checked when it was requested. The new address
   * counts as confirmed. Everything addressed to the old one stops working: confirmation and reset
   * links, and invitations other people sent to it. Opening the link twice is harmless.
   */
  confirm(token: string): void {
    const { store } = this.d
    const tokenHash = hashToken(token)
    const found = store.tokens.findEmailChange(tokenHash)
    const user = found && store.users.findById(found.userId)
    if (!found || !user) throw invalidEmailChange()
    if (found.used) {
      if (user.email === found.newEmail) return // a scanner or double click got there first
      throw invalidEmailChange()
    }
    if (found.expiresAt <= this.now()) throw invalidEmailChange()
    const oldEmail = user.email
    const undoToken = generateToken()
    try {
      store.transaction(() => {
        const owner = store.users.findByEmail(found.newEmail)
        if (owner && owner.id !== user.id) throw emailInUse()
        store.users.setVerifiedEmail(user.id, found.newEmail)
        store.tokens.markEmailChangeUsed(tokenHash)
        store.tokens.deleteUserVerifications(user.id)
        store.tokens.deleteUserResets(user.id)
        store.invitations.deleteForEmail(oldEmail)
        store.invitations.moveBlocks(oldEmail, found.newEmail)
        store.tokens.createEmailChangeUndo(
          hashToken(undoToken),
          user.id,
          oldEmail,
          found.newEmail,
          this.expiresIn(UNDO_EMAIL_CHANGE_TTL_DAYS * DAY_MS),
        )
      })
    } catch (err) {
      if (isUniqueViolation(err)) throw emailInUse() // lost a race for the address
      throw err
    }
    this.sendInBackground(user.id, 'email change notice', {
      to: oldEmail,
      ...emailChangedEmail({
        name: user.name,
        newEmail: found.newEmail,
        undoLink: `${this.d.publicUrl}/undo-email-change?token=${undoToken}`,
        undoDays: UNDO_EMAIL_CHANGE_TTL_DAYS,
      }),
    })
  }

  /**
   * "This wasn't me": puts the old address back, signs out every device, cancels links that were out,
   * and emails the old address a reset link, because whoever made the change knew the password.
   * Only works while the account still has the address that change moved it to, so it can't undo
   * something older or be replayed after a later change. Works signed in or not.
   */
  undo(token: string): void {
    const { store } = this.d
    const tokenHash = hashToken(token)
    const found = store.tokens.findEmailChangeUndo(tokenHash)
    const user = found && store.users.findById(found.userId)
    if (!found || !user) throw invalidUndo()
    if (found.used) {
      if (user.email === found.oldEmail) return // a double click got there first
      throw invalidUndo()
    }
    if (found.expiresAt <= this.now() || user.email !== found.newEmail) throw invalidUndo()
    const resetToken = generateToken()
    try {
      store.transaction(() => {
        const owner = store.users.findByEmail(found.oldEmail)
        if (owner && owner.id !== user.id) throw emailInUse()
        // They opened a link sent to this inbox, so it is proven.
        store.users.setVerifiedEmail(user.id, found.oldEmail)
        store.invitations.moveBlocks(found.newEmail, found.oldEmail)
        store.tokens.markEmailChangeUndoUsed(tokenHash)
        store.tokens.deleteUserSessions(user.id)
        store.tokens.deleteUserVerifications(user.id)
        store.tokens.deleteUserEmailChanges(user.id)
        store.tokens.createReset(hashToken(resetToken), user.id, this.expiresIn(RESET_TTL_MS))
      })
    } catch (err) {
      if (isUniqueViolation(err)) throw emailInUse()
      throw err
    }
    this.sendInBackground(user.id, 'email change undo', {
      to: found.oldEmail,
      ...passwordResetEmail({
        name: user.name,
        link: `${this.d.publicUrl}/reset-password?token=${resetToken}`,
        ttlMinutes: RESET_TTL_MS / 60_000,
      }),
    })
  }

  private expiresIn(ms: number): Date {
    return new Date(this.now().getTime() + ms)
  }

  /** Email is sent after we've answered; failures are logged with the user id only (the message holds a live link). */
  private sendInBackground(userId: string, kind: string, email: Parameters<Mailer['send']>[0]) {
    sendInBackground(
      this.d.mailer,
      this.d.logger ?? console,
      `${kind} email for user ${userId}`,
      email,
    )
  }
}

const invalidUndo = () =>
  new AccountError('invalid_undo_token', 'This link is invalid or has expired')
const invalidEmailChange = () =>
  new AccountError('invalid_email_change_token', 'This link is invalid or has expired')

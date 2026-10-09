import type { RegisterInput, User } from '@lfwa/core'
import type { IdentityClaims } from '../auth/identity'
import type { PasswordHasher } from '../auth/password'
import { generateToken, hashToken } from '../auth/secrets'
import type { Store } from '../db/store'
import type { UserRecord } from '../db/users'
import { sendInBackground } from '../mail/background'
import type { Mailer } from '../mail/mailer'
import {
  changeEmailEmail,
  emailChangedEmail,
  passwordChangedEmail,
  passwordResetEmail,
  passwordSetupEmail,
  verifyEmailEmail,
} from '../mail/templates'
import { removeUserAndOwnedData } from './remove-user'

const DAY_MS = 24 * 60 * 60 * 1000
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
export const RESET_TTL_MS = 60 * 60 * 1000
export const VERIFY_TTL_MS = 24 * 60 * 60 * 1000
export const UNDO_EMAIL_CHANGE_TTL_DAYS = 7

/** Domain errors; the routes map `code` to an HTTP status. */
export class AccountError extends Error {
  constructor(
    readonly code:
      | 'email_in_use'
      | 'email_unchanged'
      | 'invalid_email_change_token'
      | 'invalid_undo_token'
      | 'password_required'
      | 'handle_in_use'
      | 'invalid_credentials'
      | 'invalid_reset_token'
      | 'invalid_verification_token'
      | 'email_not_verified'
      | 'confirmation_failed'
      | 'no_password'
      | 'password_unchanged'
      | 'password_exists',
    message: string,
  ) {
    super(message)
  }
}

export interface AccountServiceDeps {
  store: Store
  hasher: PasswordHasher
  mailer: Mailer
  /** Origin the web app is served from; used in emailed links. */
  publicUrl: string
  now?: () => Date
  /** Used only to tell new signups how long an unused, unconfirmed account is kept (0 = not deleted). */
  unconfirmedTtlDays?: number
  /** Where delivery failures are reported. */
  logger?: Pick<Console, 'error'>
}

export interface Session {
  token: string
  expiresAt: Date
  user: UserRecord
}

export class AccountService {
  private readonly now: () => Date
  /** Verified against when the email is unknown, so timing doesn't reveal which emails exist. */
  private dummyHash?: Promise<string>

  constructor(private readonly d: AccountServiceDeps) {
    this.now = d.now ?? (() => new Date())
  }

  async register(input: RegisterInput): Promise<Session> {
    const { store } = this.d
    if (store.users.findByEmail(input.email)) throw emailInUse()
    if (store.users.handleTaken(input.handle)) throw handleInUse()
    const hash = await this.d.hasher.hash(input.password)
    try {
      const user = store.transaction(() => {
        const created = store.users.create({
          name: input.name,
          email: input.email,
          emailVerified: false,
          handle: input.handle,
        })
        store.users.setPasswordHash(created.id, hash)
        return created
      })
      this.sendVerificationEmail(user)
      return this.startSession(user)
    } catch (err) {
      // Lost a race with a concurrent registration for the same email or username.
      if (String(err).includes('users.handle')) throw handleInUse()
      if (String(err).includes('UNIQUE')) throw emailInUse()
      throw err
    }
  }

  async login(email: string, password: string): Promise<Session> {
    const { store, hasher } = this.d
    const user = store.users.findByEmail(email)
    const hash = user && store.users.getPasswordHash(user.id)
    const ok = await hasher.verify(password, hash ?? (await this.getDummyHash()))
    if (!user || !hash || !ok)
      throw new AccountError('invalid_credentials', 'Invalid email or password')
    return this.startSession(user)
  }

  logout(sessionToken: string) {
    this.d.store.tokens.deleteSession(hashToken(sessionToken))
  }

  /** Resolves a session cookie to its user, or undefined if missing/expired. */
  authenticate(sessionToken: string | undefined): UserRecord | undefined {
    if (!sessionToken) return undefined
    const userId = this.d.store.tokens.findSessionUser(hashToken(sessionToken), this.now())
    return userId ? this.d.store.users.findById(userId) : undefined
  }

  handleTaken(handle: string): boolean {
    return this.d.store.users.handleTaken(handle)
  }

  toPublic(user: UserRecord): User {
    return this.d.store.users.toPublic(user)
  }

  // ---- email verification -----------------------------------------------

  /** Emails a fresh confirmation link (replacing any earlier one). No-op if already verified. */
  sendVerificationEmail(user: UserRecord) {
    if (user.emailVerified) return
    const token = generateToken()
    this.d.store.tokens.createVerification(
      hashToken(token),
      user.id,
      user.email,
      new Date(this.now().getTime() + VERIFY_TTL_MS),
    )
    const link = `${this.d.publicUrl}/verify-email?token=${token}`
    this.sendInBackground(user.id, 'email verification', {
      to: user.email,
      ...verifyEmailEmail({
        name: user.name,
        link,
        ttlHours: VERIFY_TTL_MS / 3_600_000,
        unusedAccountDays: this.d.unconfirmedTtlDays || undefined,
      }),
    })
  }

  /**
   * Confirms the address the link was sent to. Works whether or not the person is signed in
   * (they often open the link on their phone). Idempotent for an already-verified address, since
   * mail scanners and double clicks routinely open links before the person does.
   */
  verifyEmail(token: string): void {
    const { store } = this.d
    const tokenHash = hashToken(token)
    const found = store.tokens.findVerification(tokenHash)
    const user = found && store.users.findById(found.userId)
    // The link only proves the address it was sent to; if the account's email changed since, refuse.
    if (!found || !user || user.email !== found.email) throw invalidVerification()
    if (user.emailVerified) return
    if (found.used || found.expiresAt <= this.now()) throw invalidVerification()
    store.transaction(() => {
      store.users.markEmailVerified(user.id)
      store.tokens.markVerificationUsed(tokenHash)
    })
  }

  // ---- changing the email address ----------------------------------------

  /**
   * Starts a change of address: emails a link to the *new* address, and switches nothing until it is
   * opened, so a typo can't lock anyone out. The password is re-checked, as for changing it, so a
   * stolen session alone can't redirect the account's email. Accounts with no password can't change
   * it (the session would be the only proof); they add a password first.
   */
  async requestEmailChange(user: UserRecord, newEmail: string, password: string): Promise<void> {
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
      new Date(this.now().getTime() + VERIFY_TTL_MS),
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
  confirmEmailChange(token: string): void {
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
        store.tokens.createEmailChangeUndo(
          hashToken(undoToken),
          user.id,
          oldEmail,
          found.newEmail,
          new Date(this.now().getTime() + UNDO_EMAIL_CHANGE_TTL_DAYS * DAY_MS),
        )
      })
    } catch (err) {
      if (String(err).includes('UNIQUE')) throw emailInUse() // lost a race for the address
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
  undoEmailChange(token: string): void {
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
        store.tokens.markEmailChangeUndoUsed(tokenHash)
        store.tokens.deleteUserSessions(user.id)
        store.tokens.deleteUserVerifications(user.id)
        store.tokens.deleteUserEmailChanges(user.id)
        store.tokens.createReset(
          hashToken(resetToken),
          user.id,
          new Date(this.now().getTime() + RESET_TTL_MS),
        )
      })
    } catch (err) {
      if (String(err).includes('UNIQUE')) throw emailInUse()
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

  // ---- password recovery -------------------------------------------------

  /**
   * Always resolves the same way, so the response can't be used to discover which emails
   * have accounts. Only users with a local password get a link.
   */
  async requestPasswordReset(email: string): Promise<void> {
    const { store } = this.d
    const user = store.users.findByEmail(email)
    if (!user || !store.users.getPasswordHash(user.id)) return
    const token = generateToken()
    store.tokens.createReset(
      hashToken(token),
      user.id,
      new Date(this.now().getTime() + RESET_TTL_MS),
    )
    const link = `${this.d.publicUrl}/reset-password?token=${token}`
    this.sendInBackground(user.id, 'password reset', {
      to: user.email,
      ...passwordResetEmail({ name: user.name, link, ttlMinutes: RESET_TTL_MS / 60_000 }),
    })
  }

  /**
   * Changes the password for someone who is signed in. Needs the current one (so a stolen session
   * can't quietly take over the account), signs out every *other* device, cancels outstanding
   * reset links, and emails a notice so an unwanted change is noticed.
   */
  async changePassword(
    user: UserRecord,
    sessionToken: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const { store, hasher } = this.d
    const hash = store.users.getPasswordHash(user.id)
    if (!hash) {
      throw new AccountError(
        'no_password',
        'This account signs in without a password. Use "Set a password" to add one.',
      )
    }
    if (!(await hasher.verify(currentPassword, hash))) {
      throw new AccountError('confirmation_failed', 'Your current password is incorrect')
    }
    if (newPassword === currentPassword) {
      throw new AccountError(
        'password_unchanged',
        'Choose a password different from your current one',
      )
    }
    const newHash = await hasher.hash(newPassword)
    store.transaction(() => {
      store.users.setPasswordHash(user.id, newHash)
      store.tokens.deleteUserSessionsExcept(user.id, hashToken(sessionToken))
      store.tokens.deleteUserResets(user.id)
      store.tokens.deleteUserEmailChanges(user.id)
    })
    sendInBackground(
      this.d.mailer,
      this.d.logger ?? console,
      `password change notice for user ${user.id}`,
      {
        to: user.email,
        ...passwordChangedEmail({
          name: user.name,
          resetUrl: `${this.d.publicUrl}/forgot-password`,
        }),
      },
    )
  }

  /**
   * For accounts with no password (they sign in with Google): emails a link that lets them choose
   * one. The emailed link, rather than re-entering a password, is what proves it's really them, so a
   * hijacked session alone can't add a password and keep access.
   */
  requestPasswordSetup(user: UserRecord): void {
    const { store } = this.d
    if (store.users.getPasswordHash(user.id)) {
      throw new AccountError(
        'password_exists',
        'This account already has a password. Change it instead.',
      )
    }
    const token = generateToken()
    store.tokens.createReset(
      hashToken(token),
      user.id,
      new Date(this.now().getTime() + RESET_TTL_MS),
    )
    this.sendInBackground(user.id, 'password setup', {
      to: user.email,
      ...passwordSetupEmail({
        name: user.name,
        link: `${this.d.publicUrl}/reset-password?token=${token}`,
        ttlMinutes: RESET_TTL_MS / 60_000,
      }),
    })
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const { store } = this.d
    const tokenHash = hashToken(token)
    const userId = store.tokens.findValidReset(tokenHash, this.now())
    if (!userId)
      throw new AccountError('invalid_reset_token', 'This reset link is invalid or has expired')
    const hash = await this.d.hasher.hash(newPassword)
    store.transaction(() => {
      store.users.setPasswordHash(userId, hash)
      store.users.markEmailVerified(userId) // they received the email, so they own it
      store.tokens.markResetUsed(tokenHash)
      store.tokens.deleteUserSessions(userId) // sign out anyone who had the old password
      store.tokens.deleteUserEmailChanges(userId) // ...and drop a redirect they may have started
    })
  }

  /**
   * Email is sent after we've already answered. Waiting would make "this address has an account"
   * observable (slower response, or an error when the mail server is down). Failures are logged
   * with the user id only, never the message, since it contains a live sign-in link.
   */
  private sendInBackground(userId: string, kind: string, email: Parameters<Mailer['send']>[0]) {
    const logger = this.d.logger ?? console
    sendInBackground(this.d.mailer, logger, `${kind} email for user ${userId}`, email)
  }

  // ---- external identity login --------------------------------------------

  async loginWithIdentity(provider: string, claims: IdentityClaims): Promise<Session> {
    const { store } = this.d
    const existing = store.users.findByIdentity(provider, claims.subject)
    if (existing) return this.startSession(existing)

    // We only trust a provider's email if the provider says it is verified.
    if (!claims.emailVerified) {
      throw new AccountError(
        'email_not_verified',
        'Your email address is not verified with this provider',
      )
    }

    const user = store.transaction(() => {
      const byEmail = store.users.findByEmail(claims.email)
      if (byEmail) {
        // The provider has proven control of this address. A local account that never proved
        // it could belong to someone who pre-registered a victim's email, so its password
        // (and sessions) are discarded rather than inherited.
        if (!byEmail.emailVerified) {
          store.users.removePassword(byEmail.id)
          store.tokens.deleteUserSessions(byEmail.id)
          store.users.markEmailVerified(byEmail.id)
        }
        store.users.linkIdentity(byEmail.id, provider, claims.subject)
        return byEmail
      }
      const created = store.users.create({
        name: claims.name,
        email: claims.email,
        emailVerified: true,
      })
      store.users.linkIdentity(created.id, provider, claims.subject)
      return created
    })
    return this.startSession(user)
  }

  // ---- deletion -----------------------------------------------------------

  /**
   * Deletes the account and everything that belongs only to it:
   * credentials, identities, sessions, reset tokens, memberships, and every profile (with its
   * drafts) of which this user is the sole member. In shared profiles the user is removed;
   * if they were the owner, the longest-standing remaining member becomes owner. Drafts the
   * user wrote in shared profiles stay with the profile (their author reference is cleared).
   */
  async deleteAccount(user: UserRecord, confirmEmail: string, password?: string): Promise<void> {
    const { store, hasher } = this.d
    if (confirmEmail !== user.email) {
      throw new AccountError('confirmation_failed', 'The email address does not match')
    }
    const hash = store.users.getPasswordHash(user.id)
    if (hash && !(password && (await hasher.verify(password, hash)))) {
      throw new AccountError('confirmation_failed', 'Incorrect password')
    }

    store.transaction(() => removeUserAndOwnedData(store, user))
  }

  // ---- internals ----------------------------------------------------------

  private startSession(user: UserRecord): Session {
    const token = generateToken()
    const expiresAt = new Date(this.now().getTime() + SESSION_TTL_MS)
    this.d.store.tokens.createSession(hashToken(token), user.id, expiresAt)
    return { token, expiresAt, user }
  }

  private getDummyHash() {
    return (this.dummyHash ??= this.d.hasher.hash('not-a-real-password'))
  }
}

const invalidVerification = () =>
  new AccountError('invalid_verification_token', 'This verification link is invalid or has expired')
const invalidUndo = () =>
  new AccountError('invalid_undo_token', 'This link is invalid or has expired')
const invalidEmailChange = () =>
  new AccountError('invalid_email_change_token', 'This link is invalid or has expired')
const handleInUse = () =>
  new AccountError('handle_in_use', 'That username is already taken. Try another.')
const emailInUse = () =>
  new AccountError('email_in_use', 'An account with this email already exists')

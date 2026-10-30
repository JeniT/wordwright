import type {
  Approval,
  RegisterInput,
  SignedInDevice,
  User,
  IdentityClaims,
  Mailer,
} from '@wordwright/core'
import { UNKNOWN_DEVICE } from '../auth/device'
import type { PasswordHasher } from '../auth/password'
import { generateToken, hashToken } from '../auth/secrets'
import type { Store } from '../db/store'
import type { UserRecord } from '../db/users'
import { fail, notFound } from '../errors'
import { sendInBackground } from '../mail/background'
import {
  passwordChangedEmail,
  passwordResetEmail,
  passwordSetupEmail,
  deletionReminderEmail,
  verifyEmailEmail,
} from '../mail/templates'
import { noteDeletion, type DeletionJournal } from './deletion-journal'
import { removeUserAndOwnedData } from './remove-user'
import { isSoleOwnerOfSharedPublication, NEEDS_ANOTHER_OWNER } from './owners'

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
export const RESET_TTL_MS = 60 * 60 * 1000
export const VERIFY_TTL_MS = 24 * 60 * 60 * 1000

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
      | 'password_exists'
      | 'sole_owner'
      | 'too_many_signups',
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
  /** Notes each deletion, so it can be repeated after a restore (#410). */
  deletionJournal?: DeletionJournal
  /**
   * The private alpha (#328): whether a new account waits for the owner's approval. False makes every account
   * approved from the start (development, tests, and a site that is open to anyone).
   */
  approvalRequired?: boolean
  /** Addresses that become admins once confirmed (`ADMIN_EMAILS`). Lower case. */
  adminEmails?: string[]
  /**
   * Asked just before a sign-in through an identity provider would make a new account (never for someone who already has
   * one). The same allowance as the email form's, so Google is not a way round it.
   */
  signupAllowed?: () => boolean
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

  /**
   * Where a new account starts: waiting, unless approval is off or it is made by accepting an invitation from an approved
   * person. That rule lives here so email, Google and invited sign-ups cannot disagree.
   */
  startingApproval(options: { invitedBy?: string | null; verifiedEmail?: string } = {}): Approval {
    if (!this.d.approvalRequired) return 'approved'
    // An address in `ADMIN_EMAILS` that the provider has already confirmed is the owner's: nobody else could approve it.
    if (options.verifiedEmail && this.isAdminEmail(options.verifiedEmail)) return 'approved'
    return this.invitedByApproved(options.invitedBy) ? 'approved' : 'waiting'
  }

  /** Whether the address is one of `ADMIN_EMAILS`. Used to let the owner in without anyone to approve them. */
  isAdminEmail(email: string): boolean {
    return !!this.d.adminEmails?.includes(email.trim().toLowerCase())
  }

  /**
   * Accepting an invitation from an approved person lets a waiting account in (#328); a declined one stays declined,
   * since the owner has already decided. Call inside the transaction that accepts.
   */
  approveByInvitation(user: UserRecord, invitedBy: string | null) {
    if (user.approval === 'waiting' && this.invitedByApproved(invitedBy)) {
      this.d.store.users.setApproval(user.id, 'approved')
    }
  }

  private invitedByApproved(invitedBy?: string | null): boolean {
    const inviter = invitedBy ? this.d.store.users.findById(invitedBy) : undefined
    return inviter?.approval === 'approved'
  }

  async register(input: RegisterInput, deviceLabel?: string): Promise<Session> {
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
          approval: this.startingApproval(),
        })
        store.users.setPasswordHash(created.id, hash)
        return created
      })
      this.sendVerificationEmail(user)
      return this.startSession(user, deviceLabel)
    } catch (err) {
      // Lost a race with a concurrent registration for the same email or username.
      if (String(err).includes('users.handle')) throw handleInUse()
      if (isUniqueViolation(err)) throw emailInUse()
      throw err
    }
  }

  /**
   * A new person following a review link: an account that can only review (no username, no publication), with the
   * address confirmed because the link only ever reached that inbox. `enroll` runs in the same transaction, so the
   * account never exists without the review it was made for.
   */
  async registerReviewer(
    input: { name: string; email: string; password: string; invitedBy: string | null },
    enroll: (user: UserRecord) => void,
    deviceLabel?: string,
  ): Promise<Session> {
    const { store } = this.d
    if (store.users.findByEmail(input.email)) throw emailInUse()
    const hash = await this.d.hasher.hash(input.password)
    try {
      const user = store.transaction(() => {
        const created = store.users.create({
          name: input.name,
          email: input.email,
          emailVerified: true,
          reviewerOnly: true,
          approval: this.startingApproval({
            invitedBy: input.invitedBy,
            verifiedEmail: input.email,
          }),
        })
        store.users.setPasswordHash(created.id, hash)
        enroll(created)
        return created
      })
      return this.startSession(user, deviceLabel)
    } catch (err) {
      if (isUniqueViolation(err)) throw emailInUse()
      throw err
    }
  }

  async login(email: string, password: string, deviceLabel?: string): Promise<Session> {
    const { store, hasher } = this.d
    const user = store.users.findByEmail(email)
    const hash = user && store.users.getPasswordHash(user.id)
    const ok = await hasher.verify(password, hash ?? (await this.getDummyHash()))
    if (!user || !hash || !ok)
      throw new AccountError('invalid_credentials', 'Invalid email or password')
    return this.startSession(user, deviceLabel)
  }

  logout(sessionToken: string) {
    this.d.store.tokens.deleteSession(hashToken(sessionToken))
  }

  /** Resolves a session cookie to its user, or undefined if missing/expired. */
  authenticate(sessionToken: string | undefined): UserRecord | undefined {
    if (!sessionToken) return undefined
    const userId = this.d.store.tokens.findSessionUser(hashToken(sessionToken), this.now())
    const user = userId ? this.d.store.users.findById(userId) : undefined
    return user && this.promoteAdmin(user)
  }

  /**
   * An account whose confirmed address is in `ADMIN_EMAILS` becomes an admin, and is approved (an admin has to be able
   * to sign in). Done when they next use the app, so adding an address to the settings needs no extra step. Nothing
   * ever takes admin away here: the command and a change of address do that.
   */
  private promoteAdmin(user: UserRecord): UserRecord {
    if (user.isAdmin || !user.emailVerified || !this.isAdminEmail(user.email)) return user
    const { users } = this.d.store
    users.setAdmin(user.id, true)
    users.setApproval(user.id, 'approved')
    return users.findById(user.id)!
  }

  // ---- where the person is signed in ----------------------------------------

  /** Their sessions that still work, the one making this request first (it is marked `current`). */
  listDevices(user: UserRecord, sessionToken: string): SignedInDevice[] {
    const mine = hashToken(sessionToken)
    return this.d.store.tokens
      .listSessions(user.id, this.now())
      .map((s) => ({
        id: s.id,
        deviceLabel: s.deviceLabel ?? UNKNOWN_DEVICE,
        lastUsedAt: s.lastUsedAt,
        current: s.tokenHash === mine,
      }))
      .sort((a, b) => Number(b.current) - Number(a.current)) // stable: the rest stay most recent first
  }

  /** Ends one other session. Someone else's id is "not found", the same as one that doesn't exist. */
  signOutDevice(user: UserRecord, sessionToken: string, id: string) {
    const { tokens } = this.d.store
    const target = tokens.listSessions(user.id, this.now()).find((s) => s.id === id)
    if (target?.tokenHash === hashToken(sessionToken)) {
      throw fail(400, 'This is the device you are using. Use "Sign out" in the menu to end it.')
    }
    if (!tokens.deleteUserSessionById(user.id, id)) throw notFound()
  }

  /** Ends every session but this one. Returns how many working sessions that was. */
  signOutOtherDevices(user: UserRecord, sessionToken: string): number {
    const { tokens } = this.d.store
    const others = tokens
      .listSessions(user.id, this.now())
      .filter((s) => s.tokenHash !== hashToken(sessionToken)).length
    tokens.deleteUserSessionsExcept(user.id, hashToken(sessionToken))
    return others
  }

  handleTaken(handle: string): boolean {
    return this.d.store.users.handleTaken(handle)
  }

  /**
   * Sets the person's username (which may be the one they have, to say they're happy with it).
   * Publication ids that already exist keep the old one; only new publications, and renamed ones, use it.
   */
  changeHandle(user: UserRecord, handle: string): UserRecord {
    const { store } = this.d
    if (store.users.handleTaken(handle, user.id)) throw handleInUse()
    try {
      store.transaction(() => store.users.setHandle(user.id, handle, user.handle))
    } catch (err) {
      if (String(err).includes('users.handle')) throw handleInUse()
      throw err
    }
    return store.users.findById(user.id)!
  }

  /**
   * Changes the name other people see (brainstorm messages, note authors, member lists, invitations).
   * Nothing stores a copy of it: those places read the current name each time they are shown.
   */
  changeName(user: UserRecord, name: string): UserRecord {
    this.d.store.users.setName(user.id, name)
    return this.d.store.users.findById(user.id)!
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
      this.expiresIn(VERIFY_TTL_MS),
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
   * Warns an unconfirmed, unused account that it is about to be deleted, with a fresh confirmation
   * link (replacing any earlier one) so keeping it takes one click. Sent in the background.
   */
  sendDeletionReminder(user: UserRecord, daysLeft: number) {
    const token = generateToken()
    this.d.store.tokens.createVerification(
      hashToken(token),
      user.id,
      user.email,
      this.expiresIn(VERIFY_TTL_MS),
    )
    this.sendInBackground(user.id, 'deletion reminder', {
      to: user.email,
      ...deletionReminderEmail({
        name: user.name,
        link: `${this.d.publicUrl}/verify-email?token=${token}`,
        daysLeft,
        ttlHours: VERIFY_TTL_MS / 3_600_000,
        signInLink: `${this.d.publicUrl}/login`,
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
    // Confirming the owner's address is what lets them in (they may open the link on a phone, signed out).
    this.promoteAdmin(store.users.findById(user.id)!)
  }

  // ---- password recovery -------------------------------------------------

  /**
   * Always resolves the same way, so the response can't be used to discover which emails
   * have accounts. Only accounts that sign in with a password, or with nothing yet, get a link.
   */
  async requestPasswordReset(email: string): Promise<void> {
    const { store } = this.d
    const user = store.users.findByEmail(email)
    // An account with no password and no other way in (the seeded Admin, #367) gets a link to choose one.
    if (!user) return
    if (!store.users.getPasswordHash(user.id) && store.users.listProviders(user.id).length > 0)
      return
    const token = generateToken()
    store.tokens.createReset(hashToken(token), user.id, this.expiresIn(RESET_TTL_MS))
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
    this.sendInBackground(user.id, 'password change notice', {
      to: user.email,
      ...passwordChangedEmail({
        name: user.name,
        resetUrl: `${this.d.publicUrl}/forgot-password`,
      }),
    })
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
    store.tokens.createReset(hashToken(token), user.id, this.expiresIn(RESET_TTL_MS))
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

  async loginWithIdentity(
    provider: string,
    claims: IdentityClaims,
    deviceLabel?: string,
  ): Promise<Session> {
    const { store } = this.d
    const existing = store.users.findByIdentity(provider, claims.subject)
    if (existing) return this.startSession(existing, deviceLabel)

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
      if (this.d.signupAllowed && !this.isAdminEmail(claims.email) && !this.d.signupAllowed()) {
        throw new AccountError(
          'too_many_signups',
          'A lot of people have signed up in the last hour. Try again later.',
        )
      }
      const created = store.users.create({
        name: claims.name,
        email: claims.email,
        emailVerified: true,
        approval: this.startingApproval({ verifiedEmail: claims.email }),
      })
      store.users.linkIdentity(created.id, provider, claims.subject)
      return created
    })
    return this.startSession(user, deviceLabel)
  }

  // ---- deletion -----------------------------------------------------------

  /**
   * Deletes the account and everything that belongs only to it:
   * credentials, identities, sessions, reset tokens, memberships, and every publication (with its
   * drafts) of which this user is the sole member. In shared publications the user is removed, unless they are the only
   * owner, which is refused (`sole_owner`) until they make someone else an owner. Drafts the
   * user wrote in shared publications stay with the publication (their author reference is cleared; their name stays on
   * their notes and the like if `keepName`).
   */
  async deleteAccount(user: UserRecord, password?: string, keepName = true): Promise<void> {
    const { store, hasher } = this.d
    const hash = store.users.getPasswordHash(user.id)
    // A session alone isn't proof (a borrowed device would do): Google-only accounts add a password first.
    if (!hash) {
      throw new AccountError(
        'password_required',
        'Add a password to your account first; then you can delete it.',
      )
    }
    if (!(password && (await hasher.verify(password, hash)))) {
      throw new AccountError('confirmation_failed', 'Incorrect password')
    }

    store.transaction(() => {
      // Never hand a publication to someone who didn't agree to run it: the owner chooses a successor first.
      const stranded = store.publications
        .listIdsForUser(user.id)
        .find((id) => isSoleOwnerOfSharedPublication(store, id, user.id))
      if (stranded) {
        const name = store.publications.get(stranded, user.id)?.name
        throw new AccountError(
          'sole_owner',
          `You are the only owner of “${name}”. ${NEEDS_ANOTHER_OWNER}`,
        )
      }
      removeUserAndOwnedData(store, user, { keepName })
    })
    // After the commit, so a deletion that was rolled back is never noted (replaying one would delete a live account).
    noteDeletion(
      this.d.deletionJournal,
      { at: this.now().toISOString(), userId: user.id, keepName },
      this.d.logger,
    )
  }

  // ---- internals ----------------------------------------------------------

  private expiresIn(ms: number): Date {
    return new Date(this.now().getTime() + ms)
  }

  private startSession(user: UserRecord, deviceLabel?: string): Session {
    const token = generateToken()
    const expiresAt = this.expiresIn(SESSION_TTL_MS)
    this.d.store.tokens.createSession(hashToken(token), user.id, expiresAt, deviceLabel ?? null)
    return { token, expiresAt, user }
  }

  private getDummyHash() {
    return (this.dummyHash ??= this.d.hasher.hash('not-a-real-password'))
  }
}

/** Whether a database error is a UNIQUE constraint failing, i.e. we lost a race for an address or name. */
export const isUniqueViolation = (err: unknown) => String(err).includes('UNIQUE')

const invalidVerification = () =>
  new AccountError('invalid_verification_token', 'This verification link is invalid or has expired')
const handleInUse = () =>
  new AccountError('handle_in_use', 'That username is already taken. Try another.')
export const emailInUse = () =>
  new AccountError('email_in_use', 'An account with this email already exists')

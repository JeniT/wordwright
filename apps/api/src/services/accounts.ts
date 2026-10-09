import type { RegisterInput, User } from '@lfwa/core'
import type { IdentityClaims } from '../auth/identity'
import type { PasswordHasher } from '../auth/password'
import { generateToken, hashToken } from '../auth/secrets'
import type { Store } from '../db/store'
import type { UserRecord } from '../db/users'
import type { Mailer } from '../mail/mailer'

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
export const RESET_TTL_MS = 60 * 60 * 1000

/** Domain errors; the routes map `code` to an HTTP status. */
export class AccountError extends Error {
  constructor(
    readonly code:
      | 'email_in_use'
      | 'invalid_credentials'
      | 'invalid_reset_token'
      | 'email_not_verified'
      | 'confirmation_failed',
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
    const hash = await this.d.hasher.hash(input.password)
    try {
      const user = store.transaction(() => {
        const created = store.users.create({
          name: input.name,
          email: input.email,
          emailVerified: false,
        })
        store.users.setPasswordHash(created.id, hash)
        store.profiles.create(defaultProfileName(created.name), created.id)
        return created
      })
      return this.startSession(user)
    } catch (err) {
      // Lost a race with a concurrent registration for the same email.
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

  toPublic(user: UserRecord): User {
    return this.d.store.users.toPublic(user)
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
    await this.d.mailer.send({
      to: user.email,
      subject: 'Reset your password',
      text: `Hi ${user.name},\n\nUse this link to choose a new password (valid for 1 hour):\n\n${link}\n\nIf you didn't ask for this, you can ignore this email.`,
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
    })
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
      store.profiles.create(defaultProfileName(created.name), created.id)
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

    store.transaction(() => {
      for (const profileId of store.profiles.listIdsForUser(user.id)) {
        const others = store.profiles.members(profileId).filter((m) => m.userId !== user.id)
        if (others.length === 0) {
          store.profiles.delete(profileId)
        } else if (store.profiles.roleOf(profileId, user.id) === 'owner') {
          if (!others.some((m) => m.role === 'owner')) {
            store.profiles.setRole(profileId, others[0]!.userId, 'owner')
          }
        }
      }
      store.users.delete(user.id) // cascades: credential, identities, sessions, resets, memberships
    })
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

const emailInUse = () =>
  new AccountError('email_in_use', 'An account with this email already exists')
const defaultProfileName = (name: string) => `${name}'s writing`

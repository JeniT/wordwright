import { createHash } from 'node:crypto'
import { zValidator } from '@hono/zod-validator'
import { Hono, type Context } from 'hono'
import { deleteCookie, getCookie, getSignedCookie, setCookie, setSignedCookie } from 'hono/cookie'
import { HTTPException } from 'hono/http-exception'
import {
  ForgotPasswordInputSchema,
  LoginInputSchema,
  RegisterInputSchema,
  UsernameInputSchema,
  type HandleAvailability,
  ResetPasswordInputSchema,
  safeNextPath,
  VerifyEmailInputSchema,
  type AuthConfig,
} from '@lfwa/core'
import type { IdentityProvider } from '../auth/identity'
import { requireUser, SESSION_COOKIE, type AppEnv } from '../auth/middleware'
import type { RateLimiter } from '../auth/rate-limit'
import { generateToken } from '../auth/secrets'
import { validateJson } from '../validate'
import { AccountError, type AccountService, type Session } from '../services/accounts'

const OAUTH_COOKIE = 'lfwa_oauth'
const OAUTH_TTL_SECONDS = 600

export interface AuthRouteDeps {
  accounts: AccountService
  identityProviders: IdentityProvider[]
  /** Origin the web app is served from (also the origin the OAuth redirect URI lives on). */
  publicUrl: string
  sessionSecret: string
  /** Throttles guessing per email address. */
  loginLimiter: RateLimiter
  resetLimiter: RateLimiter
  /** Throttles "resend verification email" per user. */
  verificationLimiter: RateLimiter
  /** Throttles username availability checks (one shared bucket: the API doesn't see client IPs). */
  handleCheckLimiter: RateLimiter
}

const STATUS = {
  email_in_use: 409,
  email_unchanged: 400,
  invalid_email_change_token: 400,
  password_required: 400,
  handle_in_use: 409,
  invalid_credentials: 401,
  invalid_reset_token: 400,
  invalid_verification_token: 400,
  no_password: 400,
  password_unchanged: 400,
  password_exists: 409,
  email_not_verified: 403,
  confirmation_failed: 403,
} as const

export function toHttpError(err: unknown): never {
  if (err instanceof AccountError) {
    throw new HTTPException(STATUS[err.code], { message: err.message })
  }
  throw err
}

export function authRoutes(d: AuthRouteDeps) {
  const secure = d.publicUrl.startsWith('https:')

  function setSession(c: Context, session: Session) {
    setCookie(c, SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: 'Lax',
      secure,
      path: '/',
      expires: session.expiresAt,
    })
  }

  const throttle = (limiter: RateLimiter, email: string) => {
    if (!limiter.allow(email)) {
      throw new HTTPException(429, { message: 'Too many attempts. Try again later.' })
    }
  }

  return (
    new Hono<AppEnv>()
      .get('/config', (c) =>
        c.json({
          providers: d.identityProviders.map((p) => ({ id: p.id, label: p.label })),
        } satisfies AuthConfig),
      )

      .get('/me', requireUser(d.accounts), (c) => c.json(d.accounts.toPublic(c.get('user'))))

      // Unauthenticated so it works on the sign-up form. Usernames are already public (they start
      // every profile address), so this reveals nothing new, but it is throttled all the same.
      .get('/handle-available', (c) => {
        throttle(d.handleCheckLimiter, 'handle-check')
        const parsed = UsernameInputSchema.safeParse(c.req.query('handle') ?? '')
        if (!parsed.success) {
          throw new HTTPException(400, { message: parsed.error.issues[0]?.message })
        }
        return c.json({
          available: !d.accounts.handleTaken(parsed.data),
        } satisfies HandleAvailability)
      })

      .post('/register', validateJson(RegisterInputSchema), async (c) => {
        const session = await d.accounts.register(c.req.valid('json')).catch(toHttpError)
        setSession(c, session)
        return c.json(d.accounts.toPublic(session.user), 201)
      })

      .post('/login', zValidator('json', LoginInputSchema), async (c) => {
        const { email, password } = c.req.valid('json')
        throttle(d.loginLimiter, email)
        const session = await d.accounts.login(email, password).catch(toHttpError)
        setSession(c, session)
        return c.json(d.accounts.toPublic(session.user))
      })

      .post('/logout', (c) => {
        const token = getCookie(c, SESSION_COOKIE)
        if (token) d.accounts.logout(token)
        deleteCookie(c, SESSION_COOKIE, { path: '/' })
        return c.body(null, 204)
      })

      .post('/forgot-password', zValidator('json', ForgotPasswordInputSchema), async (c) => {
        const { email } = c.req.valid('json')
        throttle(d.resetLimiter, email)
        await d.accounts.requestPasswordReset(email)
        // Same answer whether or not the address has an account.
        return c.json({ ok: true })
      })

      .post('/reset-password', zValidator('json', ResetPasswordInputSchema), async (c) => {
        const { token, password } = c.req.valid('json')
        await d.accounts.resetPassword(token, password).catch(toHttpError)
        return c.json({ ok: true })
      })

      .post('/verify-email', zValidator('json', VerifyEmailInputSchema), (c) => {
        try {
          d.accounts.verifyEmail(c.req.valid('json').token)
        } catch (err) {
          toHttpError(err)
        }
        return c.json({ ok: true })
      })

      .post('/confirm-email-change', zValidator('json', VerifyEmailInputSchema), (c) => {
        try {
          d.accounts.confirmEmailChange(c.req.valid('json').token)
        } catch (err) {
          toHttpError(err)
        }
        return c.json({ ok: true })
      })

      .post('/resend-verification', requireUser(d.accounts), (c) => {
        const user = c.get('user')
        throttle(d.verificationLimiter, user.id)
        d.accounts.sendVerificationEmail(user)
        return c.json({ ok: true })
      })

      // ---- OAuth / OpenID Connect login -------------------------------------
      .get('/oauth/:provider/start', async (c) => {
        const provider = d.identityProviders.find((p) => p.id === c.req.param('provider'))
        if (!provider) throw new HTTPException(404, { message: 'Unknown provider' })

        const state = generateToken()
        const nonce = generateToken()
        const verifier = generateToken()
        const codeChallenge = createHash('sha256').update(verifier).digest('base64url')

        await setSignedCookie(
          c,
          OAUTH_COOKIE,
          JSON.stringify({ state, nonce, verifier, next: safeNextPath(c.req.query('next')) }),
          d.sessionSecret,
          {
            httpOnly: true,
            sameSite: 'Lax',
            secure,
            path: '/api/auth/oauth',
            maxAge: OAUTH_TTL_SECONDS,
          },
        )
        return c.redirect(
          provider.authorizationUrl({
            state,
            nonce,
            codeChallenge,
            redirectUri: redirectUri(d.publicUrl, provider.id),
          }),
        )
      })

      .get('/oauth/:provider/callback', async (c) => {
        const provider = d.identityProviders.find((p) => p.id === c.req.param('provider'))
        if (!provider) throw new HTTPException(404, { message: 'Unknown provider' })
        const fail = (reason: string) => c.redirect(`${d.publicUrl}/login?error=${reason}`)

        const raw = await getSignedCookie(c, d.sessionSecret, OAUTH_COOKIE)
        deleteCookie(c, OAUTH_COOKIE, { path: '/api/auth/oauth' })
        const code = c.req.query('code')
        if (!raw || !code) return fail('oauth_failed')
        const tx = JSON.parse(raw) as {
          state: string
          nonce: string
          verifier: string
          next?: string
        }
        if (c.req.query('state') !== tx.state) return fail('oauth_failed')

        try {
          const claims = await provider.exchangeCode({
            code,
            codeVerifier: tx.verifier,
            nonce: tx.nonce,
            redirectUri: redirectUri(d.publicUrl, provider.id),
          })
          setSession(c, await d.accounts.loginWithIdentity(provider.id, claims))
          return c.redirect(`${d.publicUrl}${tx.next ?? ''}`)
        } catch (err) {
          return fail(err instanceof AccountError ? err.code : 'oauth_failed')
        }
      })
  )
}

export const redirectUri = (publicUrl: string, providerId: string) =>
  `${publicUrl}/api/auth/oauth/${providerId}/callback`

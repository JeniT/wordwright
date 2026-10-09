import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import {
  NoPageInfoFetcher,
  type FeedFetcher,
  type LLMFactory,
  type PageInfoFetcher,
  type Providers,
} from '@lfwa/core'
import type { IdentityProvider } from './auth/identity'
import { requireUser, sameOriginOnly, type AppEnv } from './auth/middleware'
import { createScryptHasher, type PasswordHasher } from './auth/password'
import { RateLimiter } from './auth/rate-limit'
import { createSecretBox } from './auth/secret-box'
import type { Store } from './db/store'
import type { Mailer } from './mail/mailer'
import { accountRoutes } from './routes/account'
import { authRoutes } from './routes/auth'
import { llmRoutes } from './routes/llm'
import { invitationRoutes } from './routes/invitations'
import { profileRoutes } from './routes/profiles'
import { AccountService } from './services/accounts'
import { IdeaLinkService } from './services/idea-links'
import { InvitationService } from './services/invitations'
import { LlmKeyService } from './services/llm'
import { DEFAULT_UNCONFIRMED_TTL_DAYS } from './services/maintenance'

export interface AppDeps {
  store: Store
  providers: Providers
  /** Reads RSS/Atom feeds when a source is added. */
  feeds: FeedFetcher
  /** Creates an LLM client from a user's own credentials. */
  llmFactory: LLMFactory
  /** Encrypts stored API keys. Keep separate from `sessionSecret`. */
  keyEncryptionSecret: string
  mailer: Mailer
  /** Looks up the title of a page that is linked from an idea. Omit to skip title lookups. */
  pageFetcher?: PageInfoFetcher
  identityProviders?: IdentityProvider[]
  /** Origin the web app is served from, e.g. http://localhost:5173. */
  publicUrl: string
  sessionSecret: string
  hasher?: PasswordHasher
  now?: () => Date
  logger?: Pick<Console, 'error'>
  /** Days an unused, unconfirmed account is kept; mentioned in the signup email. 0 = kept forever. */
  unconfirmedAccountTtlDays?: number
}

/** Builds the app from injected dependencies, so tests can supply fakes. */
export function createApp(deps: AppDeps) {
  const { store, publicUrl } = deps
  const llmKeys = new LlmKeyService({
    store,
    box: createSecretBox(deps.keyEncryptionSecret),
    factory: deps.llmFactory,
  })
  const accounts = new AccountService({
    store,
    hasher: deps.hasher ?? createScryptHasher(),
    mailer: deps.mailer,
    publicUrl,
    now: deps.now,
    logger: deps.logger,
    unconfirmedTtlDays: deps.unconfirmedAccountTtlDays ?? DEFAULT_UNCONFIRMED_TTL_DAYS,
  })

  const attempts = () =>
    new RateLimiter(10, 15 * 60 * 1000, deps.now && (() => deps.now!().getTime()))

  const app = new Hono<AppEnv>()
  app.get('/health', (c) => c.json({ status: 'ok' }))

  const api = new Hono<AppEnv>()
  api.use(sameOriginOnly(new URL(publicUrl).origin))
  api.route(
    '/auth',
    authRoutes({
      accounts,
      identityProviders: deps.identityProviders ?? [],
      publicUrl,
      sessionSecret: deps.sessionSecret,
      loginLimiter: attempts(),
      resetLimiter: attempts(),
      handleCheckLimiter: new RateLimiter(
        120,
        60 * 1000,
        deps.now && (() => deps.now!().getTime()),
      ),
      verificationLimiter: new RateLimiter(
        3,
        60 * 60 * 1000,
        deps.now && (() => deps.now!().getTime()),
      ),
    }),
  )
  api.route('/account', accountRoutes(accounts, attempts()))
  const signedIn = (routes: Hono<AppEnv>) =>
    new Hono<AppEnv>().use(requireUser(accounts)).route('/', routes)
  api.route('/llm', signedIn(llmRoutes(llmKeys, attempts())))
  const invitations = new InvitationService({
    store,
    mailer: deps.mailer,
    publicUrl,
    // 5 a day to any one address, whoever sends them.
    recipientLimiter: new RateLimiter(
      5,
      24 * 60 * 60 * 1000,
      deps.now && (() => deps.now!().getTime()),
    ),
    now: deps.now,
    logger: deps.logger,
  })
  // 20 invitations a day per person: each one emails a stranger from our server.
  const inviteLimiter = new RateLimiter(
    20,
    24 * 60 * 60 * 1000,
    deps.now && (() => deps.now!().getTime()),
  )
  // Each lookup contacts someone else's website from our server, so cap them per person.
  const ideaLinks = new IdeaLinkService({
    store,
    pages: deps.pageFetcher ?? new NoPageInfoFetcher(),
    limiter: new RateLimiter(30, 60 * 1000, deps.now && (() => deps.now!().getTime())),
  })
  api.route('/invitations', invitationRoutes(invitations, accounts))
  api.route(
    '/profiles',
    signedIn(
      profileRoutes(
        store,
        llmKeys,
        invitations,
        inviteLimiter,
        deps.feeds,
        // Each new source makes the server fetch pages: 30 an hour per person is plenty for real use.
        new RateLimiter(30, 60 * 60 * 1000, deps.now && (() => deps.now!().getTime())),
        ideaLinks,
      ),
    ),
  )
  app.route('/api', api)

  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status)
    console.error(`${c.req.method} ${new URL(c.req.url).pathname} failed:`, err)
    return c.json({ error: 'Internal server error' }, 500)
  })
  return app
}

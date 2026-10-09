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
import { BrainstormService } from './services/brainstorm'
import { BrainstormPromptService } from './services/brainstorm-prompt'
import { IdeaLinkService } from './services/idea-links'
import { InvitationService } from './services/invitations'
import { LlmKeyService } from './services/llm'
import { DEFAULT_UNCONFIRMED_TTL_DAYS } from './services/maintenance'

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

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

  const clock = deps.now && (() => deps.now!().getTime())
  const limiter = (max: number, windowMs: number) => new RateLimiter(max, windowMs, clock)
  /** Guessable or costly actions: 10 tries per 15 minutes. */
  const attempts = () => limiter(10, 15 * MINUTE)

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
      handleCheckLimiter: limiter(120, MINUTE),
      verificationLimiter: limiter(3, HOUR),
    }),
  )
  const brainstormPrompts = new BrainstormPromptService(store)
  api.route('/account', accountRoutes(accounts, attempts(), brainstormPrompts))
  const signedIn = (routes: Hono<AppEnv>) =>
    new Hono<AppEnv>().use(requireUser(accounts)).route('/', routes)
  api.route('/llm', signedIn(llmRoutes(llmKeys, attempts())))
  const invitations = new InvitationService({
    store,
    mailer: deps.mailer,
    publicUrl,
    // 5 a day to any one address, whoever sends them.
    recipientLimiter: limiter(5, DAY),
    now: deps.now,
    logger: deps.logger,
  })
  // 20 invitations a day per person: each one emails a stranger from our server.
  const inviteLimiter = limiter(20, DAY)
  // Each lookup contacts someone else's website from our server, so cap them per person.
  const ideaLinks = new IdeaLinkService({
    store,
    pages: deps.pageFetcher ?? new NoPageInfoFetcher(),
    limiter: limiter(30, MINUTE),
  })
  const brainstorm = new BrainstormService({
    store,
    prompts: brainstormPrompts,
    resolveLlm: (userId) => llmKeys.resolveWithInfo(userId),
    // Each message spends the person's own money and our server time: 30 in 10 minutes is a lot of chat.
    limiter: limiter(30, 10 * MINUTE),
    logger: deps.logger,
  })
  api.route('/invitations', invitationRoutes(invitations, accounts))
  api.route(
    '/profiles',
    signedIn(
      profileRoutes({
        store,
        llmKeys,
        invitations,
        inviteLimiter,
        feeds: deps.feeds,
        // Each new source makes the server fetch pages: 30 an hour per person is plenty for real use.
        feedLimiter: limiter(30, HOUR),
        ideaLinks,
        brainstorm,
      }),
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

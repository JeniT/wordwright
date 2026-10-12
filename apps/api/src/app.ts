import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import {
  NoPageInfoFetcher,
  NoPageTextFetcher,
  type FeedFetcher,
  type LLMFactory,
  type ResearchFactory,
  type PageInfoFetcher,
  type PageTextFetcher,
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
import { VenueSampleService } from './services/venue-samples'
import { FeedItemService } from './services/feed-items'
import { BrainstormPromptService } from './services/brainstorm-prompt'
import { ResearchService } from './services/research'
import { IdeaLinkService } from './services/idea-links'
import { InvitationService } from './services/invitations'
import { LlmKeyService } from './services/llm'
import { EmailChangeService } from './services/email-change'
import { DEFAULT_UNCONFIRMED_TTL_DAYS } from './services/maintenance'
import { DomainError } from './errors'

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
  /** Creates a web-searching researcher from a user's own credentials (the Research page). */
  researchFactory: ResearchFactory
  /** Encrypts stored API keys. Keep separate from `sessionSecret`. */
  keyEncryptionSecret: string
  mailer: Mailer
  /** Looks up the title of a page that is linked from an idea. Omit to skip title lookups. */
  pageFetcher?: PageInfoFetcher
  /** Reads the words of sample posts when describing a venue. Omit to have none read. */
  pageTextFetcher?: PageTextFetcher
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
    researchFactory: deps.researchFactory,
  })
  const hasher = deps.hasher ?? createScryptHasher()
  const accounts = new AccountService({
    store,
    hasher,
    mailer: deps.mailer,
    publicUrl,
    now: deps.now,
    logger: deps.logger,
    unconfirmedTtlDays: deps.unconfirmedAccountTtlDays ?? DEFAULT_UNCONFIRMED_TTL_DAYS,
  })

  const emailChanges = new EmailChangeService({
    store,
    hasher,
    mailer: deps.mailer,
    publicUrl,
    now: deps.now,
    logger: deps.logger,
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
      emailChanges,
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
  api.route(
    '/account',
    accountRoutes(
      accounts,
      emailChanges,
      attempts(),
      brainstormPrompts,
      limiter(5, DAY),
      store.userSettings,
    ),
  )
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
    // The same lookups that title a typed link, so the same page fetcher.
    pages: deps.pageFetcher ?? new NoPageInfoFetcher(),
    // Each message spends the person's own money and our server time: 30 in 10 minutes is a lot of chat.
    limiter: limiter(30, 10 * MINUTE),
    logger: deps.logger,
  })
  const research = new ResearchService({
    store,
    resolveResearch: (userId) => llmKeys.resolveResearchWithInfo(userId),
    // The same lookups that title a typed link, so the same page fetcher.
    pages: deps.pageFetcher ?? new NoPageInfoFetcher(),
    // A search is a bigger bill than a message and makes the server look at several sites: 10 an hour.
    limiter: limiter(10, HOUR),
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
        feedItems: new FeedItemService(
          store,
          deps.feeds,
          deps.now ?? (() => new Date()),
          // Reads are mostly answered from the kept copy; this caps the ones that go out.
          limiter(120, HOUR),
        ),
        venueSamples: new VenueSampleService(
          deps.feeds,
          deps.pageTextFetcher ?? new NoPageTextFetcher(),
        ),
        // Each look fetches a feed and up to five pages for the person: 20 an hour is plenty for real use.
        venueLimiter: limiter(20, HOUR),
        ideaLinks,
        brainstorm,
        research,
      }),
    ),
  )
  app.route('/api', api)

  app.onError((err, c) => {
    if (err instanceof DomainError) return c.json({ error: err.message }, err.status)
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status)
    console.error(`${c.req.method} ${new URL(c.req.url).pathname} failed:`, err)
    return c.json({ error: 'Internal server error' }, 500)
  })
  return app
}

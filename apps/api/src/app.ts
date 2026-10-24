import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import {
  NoPageInfoFetcher,
  type FeedFetcher,
  type LLMFactory,
  type ResearchFactory,
  type PageInfoFetcher,
  type Providers,
} from '@wordwright/core'
import type { IdentityProvider } from './auth/identity'
import { requireUser, sameOriginOnly, type AppEnv } from './auth/middleware'
import { createScryptHasher, type PasswordHasher } from './auth/password'
import { RateLimiter } from './auth/rate-limit'
import { createSecretBox } from './auth/secret-box'
import type { Store } from './db/store'
import type { Mailer } from './mail/mailer'
import { accountRoutes } from './routes/account'
import { adminRoutes } from './routes/admin'
import { AdminService } from './services/admin'
import { authRoutes } from './routes/auth'
import { llmRoutes } from './routes/llm'
import { invitationRoutes } from './routes/invitations'
import { publicationRoutes } from './routes/publications'
import { AccountService } from './services/accounts'
import { BrainstormService } from './services/brainstorm'
import { FeedItemService } from './services/feed-items'
import { ResearchService } from './services/research'
import { ArticleService } from './services/articles'
import { HandoverService } from './services/handover'
import { ReviewService } from './services/reviews'
import { activeDraftRoutes } from './routes/active-drafts'
import { reviewInvitationRoutes, reviewRoutes } from './routes/reviews'
import { InvitationService } from './services/invitations'
import { ExportService } from './services/export'
import { LlmKeyService } from './services/llm'
import { EmailChangeService } from './services/email-change'
import { DEFAULT_UNCONFIRMED_TTL_DAYS } from './services/maintenance'
import { DomainError, describeError } from './errors'

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
  identityProviders?: IdentityProvider[]
  /** Origin the web app is served from, e.g. http://localhost:5173. */
  publicUrl: string
  sessionSecret: string
  hasher?: PasswordHasher
  now?: () => Date
  logger?: Pick<Console, 'error'>
  /** Days an unused, unconfirmed account is kept; mentioned in the signup email. 0 = kept forever. */
  unconfirmedAccountTtlDays?: number
  /** The private alpha (#328): new accounts wait for approval. Off (the default here) makes them approved at once. */
  approvalRequired?: boolean
  /** Addresses that become admins once confirmed (`ADMIN_EMAILS`). */
  adminEmails?: string[]
  /** Sign-ups allowed an hour, in one shared bucket (default 30). The e2e servers raise it: one run signs up many. */
  signupsPerHour?: number
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
  const clock = deps.now && (() => deps.now!().getTime())
  const limiter = (max: number, windowMs: number) => new RateLimiter(max, windowMs, clock)
  // One shared bucket (the API doesn't see client IPs) for every way of making an account: each sends an email or
  // adds a row. The email form and the Google callback both draw on it.
  const registerLimiter = limiter(deps.signupsPerHour ?? 30, HOUR)
  const hasher = deps.hasher ?? createScryptHasher()
  const accounts = new AccountService({
    store,
    hasher,
    mailer: deps.mailer,
    publicUrl,
    now: deps.now,
    logger: deps.logger,
    unconfirmedTtlDays: deps.unconfirmedAccountTtlDays ?? DEFAULT_UNCONFIRMED_TTL_DAYS,
    approvalRequired: deps.approvalRequired,
    adminEmails: deps.adminEmails?.map((e) => e.trim().toLowerCase()).filter(Boolean),
    signupAllowed: () => registerLimiter.allow('register'),
  })

  const emailChanges = new EmailChangeService({
    store,
    hasher,
    mailer: deps.mailer,
    publicUrl,
    now: deps.now,
    logger: deps.logger,
  })

  /** Guessable or costly actions: 10 tries per 15 minutes. */
  const attempts = () => limiter(10, 15 * MINUTE)

  const reviews = new ReviewService({
    store,
    mailer: deps.mailer,
    accounts,
    publicUrl,
    // 5 a day to any one address, whoever sends them (the same cap as publication invitations).
    recipientLimiter: limiter(5, DAY),
    now: deps.now,
    logger: deps.logger,
  })

  const app = new Hono<AppEnv>()
  app.get('/health', (c) => c.json({ status: 'ok' }))
  // Health says the process is up; ready says it can serve (database open and migrated). Containers use ready.
  app.get('/ready', (c) =>
    store.ready() ? c.json({ status: 'ready' }) : c.json({ status: 'not ready' }, 503),
  )

  const api = new Hono<AppEnv>()
  api.use(sameOriginOnly(new URL(publicUrl).origin))
  api.route(
    '/auth',
    authRoutes({
      accounts,
      reviews,
      emailChanges,
      identityProviders: deps.identityProviders ?? [],
      publicUrl,
      sessionSecret: deps.sessionSecret,
      loginLimiter: attempts(),
      resetLimiter: attempts(),
      handleCheckLimiter: limiter(120, MINUTE),
      verificationLimiter: limiter(3, HOUR),
      registerLimiter,
    }),
  )
  const exportService = new ExportService(store, deps.now)
  const exportLimiter = limiter(5, HOUR)
  api.route(
    '/account',
    accountRoutes(
      accounts,
      emailChanges,
      attempts(),
      limiter(5, DAY),
      store.userSettings,
      exportService,
      exportLimiter,
    ),
  )
  const signedIn = (routes: Hono<AppEnv>) =>
    new Hono<AppEnv>().use(requireUser(accounts)).route('/', routes)
  // Decisions email the person, so each admin gets a generous but finite number an hour.
  const admin = new AdminService({
    store,
    mailer: deps.mailer,
    publicUrl,
    logger: deps.logger,
  })
  api.route('/admin', signedIn(adminRoutes(admin, limiter(120, HOUR))))
  api.route('/llm', signedIn(llmRoutes(llmKeys, attempts(), limiter(30, MINUTE))))
  const invitations = new InvitationService({
    store,
    mailer: deps.mailer,
    accounts,
    publicUrl,
    // 5 a day to any one address, whoever sends them.
    recipientLimiter: limiter(5, DAY),
    now: deps.now,
    logger: deps.logger,
  })
  const handover = new HandoverService({
    store,
    mailer: deps.mailer,
    publicUrl,
    // Each offer emails a colleague: 20 a day per editor is plenty.
    offerLimiter: limiter(20, DAY),
    logger: deps.logger,
  })
  // 20 invitations a day per person: each one emails a stranger from our server.
  const inviteLimiter = limiter(20, DAY)
  // Each lookup contacts someone else's website from our server, so cap them per person.
  const articleService = new ArticleService({
    store,
    pages: deps.pageFetcher ?? new NoPageInfoFetcher(),
    limiter: limiter(30, MINUTE),
  })
  const brainstorm = new BrainstormService({
    store,
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
  api.route('/review-invitations', reviewInvitationRoutes(reviews, accounts))
  api.route('/reviews', signedIn(reviewRoutes(reviews, accounts)))
  api.route('/drafts', signedIn(activeDraftRoutes(store, deps.now ?? (() => new Date()))))
  api.route(
    '/publications',
    signedIn(
      publicationRoutes({
        store,
        llmKeys,
        invitations,
        reviews,
        handover,
        inviteLimiter,
        exports: exportService,
        exportLimiter,
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
        articleService,
        brainstorm,
        research,
      }),
    ),
  )
  app.route('/api', api)

  app.onError((err, c) => {
    if (err instanceof DomainError) return c.json({ error: err.message }, err.status)
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status)
    ;(deps.logger ?? console).error(
      `${c.req.method} ${new URL(c.req.url).pathname} failed: ${describeError(err)}`,
    )
    return c.json({ error: 'Internal server error' }, 500)
  })
  return app
}

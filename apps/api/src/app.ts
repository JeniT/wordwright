import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { LLMFactory, Providers } from '@lfwa/core'
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
import { profileRoutes } from './routes/profiles'
import { AccountService } from './services/accounts'
import { LlmKeyService } from './services/llm'

export interface AppDeps {
  store: Store
  providers: Providers
  /** Creates an LLM client from a user's own credentials. */
  llmFactory: LLMFactory
  /** Encrypts stored API keys. Keep separate from `sessionSecret`. */
  keyEncryptionSecret: string
  mailer: Mailer
  identityProviders?: IdentityProvider[]
  /** Origin the web app is served from, e.g. http://localhost:5173. */
  publicUrl: string
  sessionSecret: string
  hasher?: PasswordHasher
  now?: () => Date
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
    }),
  )
  api.route('/account', accountRoutes(accounts, attempts()))
  const signedIn = (routes: Hono<AppEnv>) =>
    new Hono<AppEnv>().use(requireUser(accounts)).route('/', routes)
  api.route('/llm', signedIn(llmRoutes(llmKeys, attempts())))
  api.route('/profiles', signedIn(profileRoutes(store, llmKeys)))
  app.route('/api', api)

  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status)
    console.error(err)
    return c.json({ error: 'Internal server error' }, 500)
  })
  return app
}

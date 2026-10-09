import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { Providers } from '@lfwa/core'
import type { IdentityProvider } from './auth/identity'
import { requireUser, sameOriginOnly, type AppEnv } from './auth/middleware'
import { createScryptHasher, type PasswordHasher } from './auth/password'
import { RateLimiter } from './auth/rate-limit'
import type { Store } from './db/store'
import type { Mailer } from './mail/mailer'
import { accountRoutes } from './routes/account'
import { authRoutes } from './routes/auth'
import { profileRoutes } from './routes/profiles'
import { AccountService } from './services/accounts'

export interface AppDeps {
  store: Store
  providers: Providers
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
  const { store, providers, publicUrl } = deps
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
  api.route(
    '/profiles',
    new Hono<AppEnv>().use(requireUser(accounts)).route('/', profileRoutes(store, providers.llm)),
  )
  app.route('/api', api)

  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status)
    console.error(err)
    return c.json({ error: 'Internal server error' }, 500)
  })
  return app
}

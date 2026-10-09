import { Hono } from 'hono'
import { bearerAuth } from 'hono/bearer-auth'
import { HTTPException } from 'hono/http-exception'
import type { Providers } from '@lfwa/core'
import type { DraftRepository } from './db/drafts'
import { assistRoutes } from './routes/assist'
import { draftRoutes } from './routes/drafts'

export interface AppDeps {
  drafts: DraftRepository
  providers: Providers
  /** If empty, auth is disabled (local development only). */
  apiToken?: string
}

/** Builds the app from injected dependencies, so tests can supply fakes. */
export function createApp({ drafts, providers, apiToken }: AppDeps) {
  const app = new Hono()
  app.get('/health', (c) => c.json({ status: 'ok' }))

  const api = new Hono()
  if (apiToken) api.use(bearerAuth({ token: apiToken }))
  api.route('/drafts', draftRoutes(drafts))
  api.route('/assist', assistRoutes(drafts, providers.llm))
  app.route('/api', api)

  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse()
    console.error(err)
    return c.json({ error: 'Internal server error' }, 500)
  })
  return app
}

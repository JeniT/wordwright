import { serve } from '@hono/node-server'
import type { Providers } from '@lfwa/core'
import { createApp } from './app'
import { googleProvider, type IdentityProvider } from './auth/identity'
import { loadConfig } from './config'
import { openStore } from './db/store'
import { fakeLlmFactory, realLlmFactory } from './llm-factory'
import { ConsoleMailer } from './mail/mailer'

const config = loadConfig()

const providers: Providers = { search: [] }

const identityProviders: IdentityProvider[] = []
if (config.GOOGLE_CLIENT_ID) {
  identityProviders.push(googleProvider(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET))
}

const app = createApp({
  store: openStore(config.DATABASE_PATH),
  providers,
  // Users bring their own API keys; there is deliberately no server-wide LLM key.
  llmFactory: config.FAKE_LLM ? fakeLlmFactory : realLlmFactory,
  keyEncryptionSecret: config.KEY_ENCRYPTION_SECRET,
  // TODO: swap for a real email adapter before production; ConsoleMailer just logs.
  mailer: new ConsoleMailer(),
  identityProviders,
  publicUrl: config.PUBLIC_URL,
  sessionSecret: config.SESSION_SECRET,
})

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(
    `API listening on http://localhost:${info.port} (llm: ${config.FAKE_LLM ? 'FAKE' : "users' own keys"}, login: local${identityProviders.map((p) => `, ${p.id}`).join('')})`,
  )
})

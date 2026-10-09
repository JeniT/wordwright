import { serve } from '@hono/node-server'
import { AnthropicProvider, FakeLLMProvider, type Providers } from '@lfwa/core'
import { createApp } from './app'
import { googleProvider, type IdentityProvider } from './auth/identity'
import { loadConfig } from './config'
import { openStore } from './db/store'
import { ConsoleMailer } from './mail/mailer'

const config = loadConfig()

const providers: Providers = {
  llm:
    config.LLM_PROVIDER === 'anthropic'
      ? new AnthropicProvider({ apiKey: config.ANTHROPIC_API_KEY, model: config.ANTHROPIC_MODEL })
      : new FakeLLMProvider(),
  search: [],
}

const identityProviders: IdentityProvider[] = []
if (config.GOOGLE_CLIENT_ID) {
  identityProviders.push(googleProvider(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET))
}

const app = createApp({
  store: openStore(config.DATABASE_PATH),
  providers,
  // TODO: swap for a real email adapter before production; ConsoleMailer just logs.
  mailer: new ConsoleMailer(),
  identityProviders,
  publicUrl: config.PUBLIC_URL,
  sessionSecret: config.SESSION_SECRET,
})

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(
    `API listening on http://localhost:${info.port} (llm: ${providers.llm.name}, login: local${identityProviders.map((p) => `, ${p.id}`).join('')})`,
  )
})

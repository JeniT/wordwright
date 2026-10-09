import { serve } from '@hono/node-server'
import { AnthropicProvider, FakeLLMProvider, type Providers } from '@lfwa/core'
import { createApp } from './app'
import { loadConfig } from './config'
import { SqliteDraftRepository } from './db/drafts'

const config = loadConfig()

const providers: Providers = {
  llm:
    config.LLM_PROVIDER === 'anthropic'
      ? new AnthropicProvider({ apiKey: config.ANTHROPIC_API_KEY, model: config.ANTHROPIC_MODEL })
      : new FakeLLMProvider(),
  search: [],
}

const app = createApp({
  drafts: new SqliteDraftRepository(config.DATABASE_PATH),
  providers,
  apiToken: config.API_TOKEN,
})

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(`API listening on http://localhost:${info.port} (llm: ${providers.llm.name})`)
})

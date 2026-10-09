import { serve } from '@hono/node-server'
import type { Providers } from '@lfwa/core'
import { createApp } from './app'
import { googleProvider, type IdentityProvider } from './auth/identity'
import { loadConfig } from './config'
import { DatabaseError } from './db/database'
import { openStore } from './db/store'
import { fakeLlmFactory, realLlmFactory } from './llm-factory'
import { createFeedFetcher } from './feeds/factory'
import { createMailer } from './mail/factory'
import { MaintenanceService, startMaintenance } from './services/maintenance'
import { SmtpMailer } from './mail/smtp-mailer'

/** Startup problems a person can fix get one clear line, not a stack trace. */
function fail(err: unknown): never {
  if (
    err instanceof DatabaseError ||
    (err instanceof Error && err.message.includes('production'))
  ) {
    console.error(`\nCannot start: ${err.message}\n`)
  } else {
    console.error('\nCannot start:', err)
  }
  process.exit(1)
}

const config = (() => {
  try {
    return loadConfig()
  } catch (err) {
    return fail(err)
  }
})()
const store = (() => {
  try {
    return openStore(config.DATABASE_PATH)
  } catch (err) {
    return fail(err)
  }
})()

const providers: Providers = { search: [] }

const identityProviders: IdentityProvider[] = []
if (config.GOOGLE_CLIENT_ID) {
  identityProviders.push(googleProvider(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET))
}

const mailer = createMailer(config)
// Surface a wrong SMTP host/password at startup, but don't refuse to boot over a transient outage.
if (mailer instanceof SmtpMailer) {
  mailer.verify().then(
    () => console.log('Email: SMTP connection verified'),
    (err: Error) =>
      console.error(`Email: SMTP check failed, reset emails may not send. ${err.message}`),
  )
}

const app = createApp({
  store,
  providers,
  feeds: createFeedFetcher(config),
  // Users bring their own API keys; there is deliberately no server-wide LLM key.
  llmFactory: config.FAKE_LLM ? fakeLlmFactory : realLlmFactory,
  keyEncryptionSecret: config.KEY_ENCRYPTION_SECRET,
  mailer,
  identityProviders,
  publicUrl: config.PUBLIC_URL,
  sessionSecret: config.SESSION_SECRET,
  unconfirmedAccountTtlDays: config.UNCONFIRMED_ACCOUNT_TTL_DAYS,
})

// Housekeeping every 6 hours: forget abandoned signups and expired sessions/links.
const maintenance = new MaintenanceService({
  store,
  unconfirmedTtlDays: config.UNCONFIRMED_ACCOUNT_TTL_DAYS,
})
startMaintenance({ run: () => maintenance.run(), intervalMs: 6 * 60 * 60 * 1000 })

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(
    `API listening on http://localhost:${info.port} (llm: ${config.FAKE_LLM ? 'FAKE' : "users' own keys"}, email: ${config.MAIL_TRANSPORT}, login: local${identityProviders.map((p) => `, ${p.id}`).join('')})`,
  )
})

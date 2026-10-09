import { z } from 'zod'
import { DEFAULT_UNCONFIRMED_TTL_DAYS } from './services/maintenance'

const ConfigSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(8787),
  /** Origin the web app is served from. Used for emailed links, OAuth redirects and CSRF checks. */
  PUBLIC_URL: z.string().default('http://localhost:5173'),
  /** Signs short-lived OAuth state cookies. Required in production. */
  SESSION_SECRET: z.string().default(''),
  /** Encrypts users' stored API keys. Required in production. Losing it makes stored keys unreadable. */
  KEY_ENCRYPTION_SECRET: z.string().default(''),
  DATABASE_PATH: z.string().default('./data/lfwa.sqlite'),
  /** Replace all LLM calls with a canned fake that accepts any key (development and e2e tests only). */
  FAKE_LLM: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /** Replace reading feeds from the internet with a canned fake (development and e2e tests only). */
  FAKE_FEEDS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /**
   * How the titles of linked pages are looked up. `http` fetches them from the web (only ever from
   * public sites). `fake` returns canned titles without any network (development and e2e tests only).
   */
  PAGE_FETCHER: z.enum(['http', 'fake']).default('http'),
  /**
   * How emails are delivered. `console` (default) just prints them to the server log, so local
   * development needs no email provider. `file` writes them to MAIL_OUTBOX_DIR. `smtp` really sends.
   */
  MAIL_TRANSPORT: z.enum(['console', 'file', 'smtp']).default('console'),
  /** Sender address, e.g. `Long-form Writing Assistant <no-reply@example.com>`. Required for smtp. */
  MAIL_FROM: z.string().default('Long-form Writing Assistant <no-reply@localhost>'),
  /** e.g. smtps://user:pass@smtp.example.com:465. Required for smtp. Contains credentials: keep it secret. */
  SMTP_URL: z.string().default(''),
  MAIL_OUTBOX_DIR: z.string().default('./data/outbox'),
  /**
   * Days after which an account that never confirmed its email and was never used (no drafts, no saved
   * API key) is deleted, freeing the address. 0 keeps them forever.
   */
  UNCONFIRMED_ACCOUNT_TTL_DAYS: z.coerce
    .number()
    .int()
    .min(0)
    .default(DEFAULT_UNCONFIRMED_TTL_DAYS),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
})
export type Config = z.infer<typeof ConfigSchema>

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const config = ConfigSchema.parse(env)
  if (config.NODE_ENV === 'production') {
    if (config.SESSION_SECRET.length < 32) {
      throw new Error('SESSION_SECRET (at least 32 characters) is required in production')
    }
    if (config.KEY_ENCRYPTION_SECRET.length < 32) {
      throw new Error('KEY_ENCRYPTION_SECRET (at least 32 characters) is required in production')
    }
    if (config.FAKE_LLM) throw new Error('FAKE_LLM must not be enabled in production')
    if (config.FAKE_FEEDS) throw new Error('FAKE_FEEDS must not be enabled in production')
    if (config.PAGE_FETCHER === 'fake') {
      throw new Error('PAGE_FETCHER=fake must not be used in production')
    }
    if (config.MAIL_TRANSPORT !== 'smtp') {
      throw new Error(
        'MAIL_TRANSPORT must be smtp in production, or password reset emails will never arrive',
      )
    }
    if (!env.MAIL_FROM) throw new Error('MAIL_FROM is required in production')
    if (!config.PUBLIC_URL.startsWith('https://')) {
      throw new Error('PUBLIC_URL must be https in production')
    }
  }
  if (config.MAIL_TRANSPORT === 'smtp' && !/^smtps?:\/\//.test(config.SMTP_URL)) {
    throw new Error('SMTP_URL (smtp:// or smtps://...) is required when MAIL_TRANSPORT=smtp')
  }
  if (!config.SESSION_SECRET) config.SESSION_SECRET = 'insecure-development-secret'
  if (!config.KEY_ENCRYPTION_SECRET)
    config.KEY_ENCRYPTION_SECRET = 'insecure-development-key-secret'
  if (!!config.GOOGLE_CLIENT_ID !== !!config.GOOGLE_CLIENT_SECRET) {
    throw new Error('Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither')
  }
  return config
}

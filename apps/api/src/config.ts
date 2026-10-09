import { z } from 'zod'

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
    if (!config.PUBLIC_URL.startsWith('https://')) {
      throw new Error('PUBLIC_URL must be https in production')
    }
  }
  if (!config.SESSION_SECRET) config.SESSION_SECRET = 'insecure-development-secret'
  if (!config.KEY_ENCRYPTION_SECRET)
    config.KEY_ENCRYPTION_SECRET = 'insecure-development-key-secret'
  if (!!config.GOOGLE_CLIENT_ID !== !!config.GOOGLE_CLIENT_SECRET) {
    throw new Error('Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither')
  }
  return config
}

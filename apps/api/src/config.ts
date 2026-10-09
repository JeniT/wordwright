import { z } from 'zod'

const ConfigSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(8787),
  /** Origin the web app is served from. Used for emailed links, OAuth redirects and CSRF checks. */
  PUBLIC_URL: z.string().default('http://localhost:5173'),
  /** Signs short-lived OAuth state cookies. Required in production. */
  SESSION_SECRET: z.string().default(''),
  DATABASE_PATH: z.string().default('./data/lfwa.sqlite'),
  LLM_PROVIDER: z.enum(['fake', 'anthropic']).default('fake'),
  ANTHROPIC_API_KEY: z.string().default(''),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-5-5'),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
})
export type Config = z.infer<typeof ConfigSchema>

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const config = ConfigSchema.parse(env)
  if (config.LLM_PROVIDER === 'anthropic' && !config.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic')
  }
  if (config.NODE_ENV === 'production') {
    if (config.SESSION_SECRET.length < 32) {
      throw new Error('SESSION_SECRET (at least 32 characters) is required in production')
    }
    if (!config.PUBLIC_URL.startsWith('https://')) {
      throw new Error('PUBLIC_URL must be https in production')
    }
  }
  if (!config.SESSION_SECRET) config.SESSION_SECRET = 'insecure-development-secret'
  if (!!config.GOOGLE_CLIENT_ID !== !!config.GOOGLE_CLIENT_SECRET) {
    throw new Error('Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither')
  }
  return config
}

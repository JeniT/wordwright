import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { LlmSettingsInputSchema } from '@lfwa/core'
import type { AppEnv } from '../auth/middleware'
import type { RateLimiter } from '../auth/rate-limit'
import { LlmError, type LlmKeyService } from '../services/llm'
import { validateJson } from '../validate'

const STATUS = {
  not_configured: 409,
  invalid_model: 400,
  missing_key: 400,
  key_rejected: 400,
  provider_unreachable: 502,
} as const

export function toLlmHttpError(err: unknown): never {
  if (err instanceof LlmError) throw new HTTPException(STATUS[err.code], { message: err.message })
  throw err
}

/** Mounted behind `requireUser`. The API key is accepted here but never returned. */
export function llmRoutes(llm: LlmKeyService, limiter: RateLimiter) {
  return new Hono<AppEnv>()
    .get('/', (c) => c.json(llm.settings(c.get('user').id)))
    .put('/', validateJson(LlmSettingsInputSchema), async (c) => {
      const userId = c.get('user').id
      // Saving a key makes a paid call to the provider; don't let this be used as a key-checking oracle.
      if (!limiter.allow(userId))
        throw new HTTPException(429, { message: 'Too many attempts. Try again later.' })
      return c.json(await llm.save(userId, c.req.valid('json')).catch(toLlmHttpError))
    })
    .delete('/', (c) => {
      llm.remove(c.get('user').id)
      return c.body(null, 204)
    })
}

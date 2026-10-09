import { zValidator } from '@hono/zod-validator'
import type { z } from 'zod'

/**
 * Validates a JSON body with a shared schema. On failure it answers 400 with `{ error: "..." }`,
 * the same shape as every other error, so the web app can show the message as it is. (The
 * library's default response is a raw zod error object, which would display as "[object Object]".)
 * The message is the first problem found; write schema messages for people, not programmers.
 */
export const validateJson = <S extends z.ZodType>(schema: S) =>
  zValidator('json', schema, (result, c) => {
    if (!result.success) {
      return c.json(
        { error: result.error.issues[0]?.message ?? 'Check the details and try again' },
        400,
      )
    }
  })

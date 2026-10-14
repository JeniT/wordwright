import type { Context } from 'hono'
import { fail } from '../errors'
import type { RateLimiter } from '../auth/rate-limit'
import type { ExportResult } from '../services/export'

/** Building an export costs the server real work, so each person gets only a few an hour. */
export function throttleExport(limiter: RateLimiter, userId: string) {
  if (!limiter.allow(userId)) {
    throw fail(429, 'You have downloaded a lot of exports. Try again in a little while.')
  }
}

/** Serves an export as a file to save. The name is made by the server from ids and a date, never from titles. */
export function zipResponse(c: Context, result: ExportResult) {
  return c.body(result.bytes as Uint8Array<ArrayBuffer>, 200, {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${result.filename}"`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
  })
}

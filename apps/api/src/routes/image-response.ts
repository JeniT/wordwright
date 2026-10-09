import type { Context } from 'hono'

/**
 * Serves a stored picture. The type was decided by looking at the bytes when it was uploaded, and the
 * headers stop a browser from treating it as anything else, so a hostile file can't run as a page.
 * Callers put a version in the URL that changes on upload, which is why it may be cached for long.
 */
export function imageResponse(c: Context, image: { contentType: string; data: Uint8Array }) {
  return c.body(image.data as Uint8Array<ArrayBuffer>, 200, {
    'Content-Type': image.contentType,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cache-Control': 'private, max-age=31536000, immutable',
  })
}

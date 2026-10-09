/**
 * Where to send someone after signing in (e.g. back to an invitation link). Only same-site paths
 * are honoured, so a crafted link can't turn sign-in into an open redirect: `//host`, `https://host`
 * and `/\host` all count as leaving the site, as do control characters.
 */
export function safeNextPath(next: unknown): string | undefined {
  if (typeof next !== 'string' || next.length > 500) return undefined
  if (!next.startsWith('/') || next.startsWith('//')) return undefined
  for (const ch of next) {
    if (ch === '\\' || ch.charCodeAt(0) < 32) return undefined
  }
  return next
}

/**
 * Human-readable identifiers.
 *
 * A publication id is `<owner handle>-<slug of its name>`, e.g. `jenit-substack`, so shared links read
 * well and two people can each have a publication called "Substack". Handles contain only letters and
 * digits (never `-`), which makes the split between handle and slug unambiguous: two different
 * (handle, slug) pairs can never produce the same id.
 */

export const HANDLE_MIN = 3
export const HANDLE_MAX = 30
export const HANDLE_PATTERN = /^[a-z0-9]+$/
/**
 * Usernames nobody may take, because they would look like the service or its staff in a publication
 * address. Only checked when a username is chosen, so an account that already has one keeps it.
 */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  'admin',
  'administrator',
  'moderator',
  'root',
  'staff',
  'support',
  'help',
  'team',
  'official',
  'security',
  'abuse',
  'system',
  'postmaster',
  'webmaster',
  'api',
  'www',
  'mail',
  'claude',
  'anthropic',
])

const SLUG_MAX = 40
/** Room kept for a numeric suffix when a candidate is already taken. */
const SUFFIX_ROOM = 4

const plain = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // accents: "é" -> "e"
    .replace(/['’]/g, '') // "Ada's" -> "Adas", not "Ada-s"
    .toLowerCase()

/** "Jeni's Substack!" -> "jenis-substack". May be empty (e.g. for a name with no Latin letters). */
export function slugify(text: string, max = SLUG_MAX - SUFFIX_ROOM): string {
  return plain(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, max)
    .replace(/-+$/, '')
}

/** A starting point for someone's handle, from their name (or, failing that, their email). */
export function suggestHandle(name: string, email: string): string {
  const compact = (s: string) => plain(s).replace(/[^a-z0-9]/g, '')
  const base = (compact(name) || compact(email.split('@')[0] ?? '') || 'writer').slice(
    0,
    HANDLE_MAX - SUFFIX_ROOM,
  )
  return base.length >= HANDLE_MIN ? base : `${base}writer`
}

export const publicationIdFor = (handle: string, publicationName: string) =>
  `${handle}-${slugify(publicationName) || 'publication'}`

/** `base`, or `base2`, `base3`... (joined by `separator`) until `isTaken` says it's free. */
export function firstAvailable(
  base: string,
  isTaken: (candidate: string) => boolean,
  separator = '',
): string {
  if (!isTaken(base)) return base
  for (let n = 2; n < 10_000; n++) {
    const candidate = `${base}${separator}${n}`
    if (!isTaken(candidate)) return candidate
  }
  throw new Error(`Could not find a free variant of "${base}"`)
}

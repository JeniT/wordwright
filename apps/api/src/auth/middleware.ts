import type { MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'
import type { PublicationRole } from '@wordwright/core'
import type { Store } from '../db/store'
import type { UserRecord } from '../db/users'
import type { AccountService } from '../services/accounts'
import { fail } from '../errors'

export const SESSION_COOKIE = 'wordwright_session'

export type AppEnv = {
  Variables: {
    user: UserRecord
    role: PublicationRole
  }
}

/**
 * What a reviewer-only account may reach (ADR 0002): who it is, signing out, its own reviews, and deleting itself.
 * Everything else answers 404, as it does for a stranger, so a reviewer finds out nothing about the rest of the app.
 */
export function reviewerMayReach(method: string, path: string): boolean {
  const p = path.replace(/^\/api/, '')
  if (p === '/auth/me' || p === '/auth/logout') return true
  if (p === '/account' && method === 'DELETE') return true
  // Accepting an invitation (to another review, or to a publication, which makes the account a full one).
  if (method === 'POST' && (p === '/review-invitations/accept' || p === '/invitations/accept'))
    return true
  return p === '/reviews' || p.startsWith('/reviews/')
}

export const requireUser =
  (accounts: AccountService): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    const user = accounts.authenticate(getCookie(c, SESSION_COOKIE))
    if (!user) throw fail(401, 'Not signed in')
    if (user.reviewerOnly && !reviewerMayReach(c.req.method, c.req.path)) {
      throw fail(404, 'Not found')
    }
    c.set('user', user)
    await next()
  }

/** Requires the signed-in user to belong to `:publicationId` (and, optionally, to be its owner). */
export const requireMember =
  (store: Store, ownerOnly = false): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    const requested = c.req.param('publicationId') ?? ''
    const role = store.publications.roleOf(requested, c.get('user').id)
    if (!role) {
      // A renamed publication: send members to its new address (everyone else gets the same 404).
      const current = store.publications.currentIdFor(requested)
      if (current && store.publications.roleOf(current, c.get('user').id)) {
        const url = new URL(c.req.url)
        url.pathname = url.pathname.replace(
          `/publications/${encodeURIComponent(requested)}`,
          `/publications/${encodeURIComponent(current)}`,
        )
        // 308 keeps the method and body of writes; 301 is the permanent redirect for reads.
        const safe = c.req.method === 'GET' || c.req.method === 'HEAD'
        return c.redirect(url.pathname + url.search, safe ? 301 : 308)
      }
    }
    // 404 rather than 403, so publication ids can't be probed.
    if (!role) throw fail(404, 'Not found')
    if (ownerOnly && role !== 'owner') throw fail(403, 'Owner only')
    c.set('role', role)
    await next()
  }

/**
 * Rejects cross-site state-changing requests. Browsers always send Origin on those; non-browser
 * clients that omit it carry no ambient cookies, so allowing them is safe. (SameSite=Lax on the
 * session cookie is the first line of defence; this is the second.)
 */
export const sameOriginOnly =
  (allowedOrigin: string): MiddlewareHandler =>
  async (c, next) => {
    const safe = ['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)
    const origin = c.req.header('origin')
    if (!safe && origin && origin !== allowedOrigin) {
      throw fail(403, 'Cross-origin request blocked')
    }
    await next()
  }

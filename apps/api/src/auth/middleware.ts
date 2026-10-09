import type { MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'
import { HTTPException } from 'hono/http-exception'
import type { ProfileRole } from '@lfwa/core'
import type { Store } from '../db/store'
import type { UserRecord } from '../db/users'
import type { AccountService } from '../services/accounts'

export const SESSION_COOKIE = 'lfwa_session'

export type AppEnv = {
  Variables: {
    user: UserRecord
    role: ProfileRole
  }
}

export const requireUser =
  (accounts: AccountService): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    const user = accounts.authenticate(getCookie(c, SESSION_COOKIE))
    if (!user) throw new HTTPException(401, { message: 'Not signed in' })
    c.set('user', user)
    await next()
  }

/** Requires the signed-in user to belong to `:profileId` (and, optionally, to be its owner). */
export const requireMember =
  (store: Store, ownerOnly = false): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    const requested = c.req.param('profileId') ?? ''
    const role = store.profiles.roleOf(requested, c.get('user').id)
    if (!role) {
      // A renamed profile: send members to its new address (everyone else gets the same 404).
      const current = store.profiles.currentIdFor(requested)
      if (current && store.profiles.roleOf(current, c.get('user').id)) {
        const url = new URL(c.req.url)
        url.pathname = url.pathname.replace(
          `/profiles/${encodeURIComponent(requested)}`,
          `/profiles/${encodeURIComponent(current)}`,
        )
        // 308 keeps the method and body of writes; 301 is the permanent redirect for reads.
        const safe = c.req.method === 'GET' || c.req.method === 'HEAD'
        return c.redirect(url.pathname + url.search, safe ? 301 : 308)
      }
    }
    // 404 rather than 403, so profile ids can't be probed.
    if (!role) throw new HTTPException(404, { message: 'Not found' })
    if (ownerOnly && role !== 'owner') throw new HTTPException(403, { message: 'Owner only' })
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
      throw new HTTPException(403, { message: 'Cross-origin request blocked' })
    }
    await next()
  }

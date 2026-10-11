import { HTTPException } from 'hono/http-exception'
import { FeedError, type FeedFetcher, type Source, type SourceItems } from '@lfwa/core'
import type { RateLimiter } from '../auth/rate-limit'
import type { SourceFetch } from '../db/sources'
import type { Store } from '../db/store'

const MINUTE = 60_000

/** A read is good for this long, however often the page is opened. */
export const ITEMS_FRESH_MS = 3 * 60 * MINUTE
/** After a failure, leave the feed alone this long before trying again. */
export const ITEMS_RETRY_MS = 30 * MINUTE
/** "Refresh" can't ask the same feed more often than this. */
export const ITEMS_REFRESH_MIN_MS = 5 * MINUTE
const READ_TIMEOUT_MS = 20_000

/**
 * A feed's recent posts, read politely: the last read is kept and used until it is a few hours old,
 * a feed that hasn't changed is asked with `If-None-Match`/`If-Modified-Since`, a failure is
 * remembered (and shown) rather than retried at once, and one read is shared by people who ask at the
 * same moment. Every read goes through the `FeedFetcher` port, with its network-safety checks.
 */
export class FeedItemService {
  private readonly inFlight = new Map<string, Promise<SourceFetch>>()

  constructor(
    private readonly store: Store,
    private readonly feeds: FeedFetcher,
    private readonly now: () => Date,
    /** Per person: each read that isn't answered from the kept copy makes the server fetch a page. */
    private readonly limiter: RateLimiter,
  ) {}

  async items(
    userId: string,
    source: Source,
    options: { refresh?: boolean } = {},
  ): Promise<SourceItems> {
    const kept = this.store.sources.getFetch(source.id)
    const sinceCheck = kept?.checkedAt
      ? this.now().getTime() - Date.parse(kept.checkedAt)
      : Infinity
    const wait = options.refresh
      ? ITEMS_REFRESH_MIN_MS
      : kept?.lastError
        ? ITEMS_RETRY_MS
        : ITEMS_FRESH_MS
    if (kept && sinceCheck < wait) return view(kept)

    const running = this.inFlight.get(source.id)
    if (running) return view(await running)

    if (!this.limiter.allow(userId)) {
      if (kept) return view(kept) // what we have is better than nothing
      throw new HTTPException(429, {
        message: 'You have asked for a lot of feeds just now. Try again in a little while.',
      })
    }
    const read = this.read(source, kept).finally(() => this.inFlight.delete(source.id))
    this.inFlight.set(source.id, read)
    return view(await read)
  }

  private async read(source: Source, kept: SourceFetch | undefined): Promise<SourceFetch> {
    const at = this.now().toISOString()
    const before: SourceFetch = kept ?? {
      items: [],
      validators: {},
      checkedAt: null,
      lastWorkedAt: null,
      lastError: null,
      lastErrorAt: null,
    }
    let next: SourceFetch
    try {
      const result = await this.feeds.readItems(source.url, {
        signal: AbortSignal.timeout(READ_TIMEOUT_MS),
        // Only worth sending if we still hold the posts it describes.
        validators: kept ? kept.validators : undefined,
      })
      next =
        result.status === 'not-modified'
          ? { ...before, checkedAt: at, lastWorkedAt: at, lastError: null, lastErrorAt: null }
          : {
              items: result.items,
              validators: result.validators,
              checkedAt: at,
              lastWorkedAt: at,
              lastError: null,
              lastErrorAt: null,
            }
    } catch (err) {
      const message =
        err instanceof FeedError
          ? err.message
          : 'That site took too long to answer, or something went wrong reading it. We will try again later.'
      next = { ...before, checkedAt: at, lastError: message, lastErrorAt: at }
    }
    // The source may have been removed while we waited; then there is nothing to keep.
    if (this.store.sources.profileOf(source.id)) this.store.sources.saveFetch(source.id, next)
    return next
  }
}

function view(f: SourceFetch): SourceItems {
  return {
    items: f.items,
    checkedAt: f.checkedAt,
    lastWorkedAt: f.lastWorkedAt,
    lastError: f.lastError,
  }
}

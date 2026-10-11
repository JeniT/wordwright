import { HTTPException } from 'hono/http-exception'
import {
  FeedError,
  linkKey,
  MAX_RECENT_POSTS,
  type FeedFetcher,
  type RecentPosts,
  type Source,
  type SourceItems,
} from '@lfwa/core'
import type { RateLimiter } from '../auth/rate-limit'
import type { SourceFetch } from '../db/sources'
import { postStatuses } from './feed-posts'
import type { Store } from '../db/store'

const MINUTE = 60_000

/** A read is good for this long, however often the page is opened. */
export const ITEMS_FRESH_MS = 3 * 60 * MINUTE
/** After a failure, leave the feed alone this long before trying again. */
export const ITEMS_RETRY_MS = 30 * MINUTE
/** "Refresh" can't ask the same feed more often than this. */
export const ITEMS_REFRESH_MIN_MS = 5 * MINUTE
const READ_TIMEOUT_MS = 20_000
/** Feeds read at the same moment when building the combined list. */
const RECENT_READS_AT_ONCE = 5

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

  /**
   * The newest posts across `sources` (in priority order), from the last `days` days. Each feed is
   * read as for `items` (so mostly from the kept copy), a few at a time; a feed that can't be read
   * is named, and its kept posts still count. The same post listed by two feeds appears once.
   */
  async recent(
    userId: string,
    profileId: string,
    sources: Source[],
    days: number,
    options: { refresh?: boolean } = {},
  ): Promise<RecentPosts> {
    const since = this.now().getTime() - days * 24 * 60 * MINUTE
    const failed: RecentPosts['failed'] = []
    const read: { source: Source; result: SourceItems | null }[] = []
    for (let i = 0; i < sources.length; i += RECENT_READS_AT_ONCE) {
      const batch = sources.slice(i, i + RECENT_READS_AT_ONCE)
      read.push(
        ...(await Promise.all(
          batch.map(async (source) => ({
            source,
            result: await this.items(userId, source, options).catch(() => null),
          })),
        )),
      )
    }

    const status = postStatuses(this.store, profileId)
    const seen = new Set<string>()
    const posts: RecentPosts['posts'] = []
    let undated = 0
    for (const { source, result } of read) {
      if (!result) {
        failed.push({ sourceId: source.id, error: 'We couldn’t read this feed just now.' })
        continue
      }
      if (result.lastError) failed.push({ sourceId: source.id, error: result.lastError })
      for (const item of result.items) {
        // The same address however it is written ("#top", "www.") is the same post.
        if (seen.has(linkKey(item.url))) continue
        seen.add(linkKey(item.url))
        if (!item.publishedAt || Number.isNaN(Date.parse(item.publishedAt))) {
          undated++
        } else if (Date.parse(item.publishedAt) >= since) {
          posts.push({ ...item, sourceId: source.id, status: status(item.url) })
        }
      }
    }
    // Stable, so posts with the same time stay in feed-priority order.
    posts.sort((a, b) => Date.parse(b.publishedAt!) - Date.parse(a.publishedAt!))
    return {
      days,
      posts: posts.slice(0, MAX_RECENT_POSTS),
      omitted: Math.max(0, posts.length - MAX_RECENT_POSTS),
      undated,
      failed,
    }
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

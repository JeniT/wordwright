import { MAX_FEED_ITEMS, type FeedItem } from '../domain'
import type { IconType } from '../images'

/** What a feed says about itself. */
export interface FeedDetails {
  /** The feed's address. If the person gave a website, this is the feed found on it. */
  url: string
  title: string
  description: string | null
  /** The website the feed belongs to. */
  siteUrl: string | null
  /** A logo the feed itself points to, if any. */
  iconUrl: string | null
}

/** A feed a web page says it offers. */
export interface FeedCandidate {
  /** The feed's address. */
  url: string
  /** What the page calls it (its `title`), if it says; reading the feed itself comes later. */
  title: string | null
  /** A feed of comments rather than of posts: rarely what a person wants, so listed last. */
  comments: boolean
}

/** The most feeds one page is asked about, so a page that lists hundreds can't flood the person. */
export const MAX_FEED_CANDIDATES = 10

/** What a server told us about the copy we hold, so asking again can be cheap. */
export interface FeedValidators {
  etag?: string | null
  lastModified?: string | null
}

export type FeedItemsResult =
  | { status: 'modified'; items: FeedItem[]; validators: FeedValidators }
  /** The feed said our copy is still current. */
  | { status: 'not-modified' }

export interface FetchedIcon {
  contentType: IconType
  data: Uint8Array
}

/** Why a feed couldn't be read. The `message` is written for the person who pasted the address. */
export type FeedErrorReason = 'not-a-feed' | 'unreachable' | 'blocked' | 'too-large'

export class FeedError extends Error {
  constructor(
    readonly reason: FeedErrorReason,
    message: string,
  ) {
    super(message)
  }
}

/**
 * Port for reading RSS/Atom feeds from the internet. The real adapter must refuse addresses on
 * private networks (the address is typed by a user, so the server would otherwise fetch internal
 * pages for them) and bound time and size. Everything else depends on this, not on how it's done.
 */
export interface FeedFetcher {
  /**
   * Reads the feed at `address`, or, when it is an ordinary web page that advertises a feed, that feed.
   * Rejects with a `FeedError`.
   */
  inspect(address: string, options?: { signal?: AbortSignal }): Promise<FeedDetails>
  /**
   * Every feed offered at `address`: the feed itself if that is what it is, else the feeds the web
   * page advertises (at most `MAX_FEED_CANDIDATES`, feeds of comments last). Rejects with a
   * `FeedError` when there are none.
   */
  discover(address: string, options?: { signal?: AbortSignal }): Promise<FeedCandidate[]>
  /**
   * The feed's recent posts, newest first, at most `MAX_FEED_ITEMS`. Pass the `validators` from the last
   * read to make a conditional request; a feed that hasn't changed answers `not-modified`. Rejects with
   * a `FeedError` (not a feed, unreachable, blocked, too large).
   */
  readItems(
    address: string,
    options?: { signal?: AbortSignal; validators?: FeedValidators },
  ): Promise<FeedItemsResult>
  /**
   * A small picture for the feed: the logo it names, else its website's icon. Never rejects;
   * resolves to null when there is none or it can't be fetched (the icon is a nicety).
   */
  fetchIcon(feed: FeedDetails, options?: { signal?: AbortSignal }): Promise<FetchedIcon | null>
}

/** A real 1x1 PNG, for fakes that need something a browser will draw. */
export const TINY_PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
)

/** A real 64x64 solid PNG: big enough, and square to its corners, to fill a picture's box (#226). */
export const SQUARE_PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAT0lEQVRo3u3PQQkAAAgEsAthMOMY3wi+hcEKLDX9WgQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQELgvg6cDEyXjFpgAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
)

/** Puts feeds of comments last and applies the cap, as every adapter must. */
export function tidyCandidates(candidates: FeedCandidate[]): FeedCandidate[] {
  const seen = new Set<string>()
  const unique = candidates.filter((c) => !seen.has(c.url) && !!seen.add(c.url))
  return [...unique.filter((c) => !c.comments), ...unique.filter((c) => c.comments)].slice(
    0,
    MAX_FEED_CANDIDATES,
  )
}

/** What a fake knows about an address: a feed's details, or (with `advertises`) a page offering feeds. */
type KnownFeed = Partial<FeedDetails> & {
  /** `'square'` gives one that fills its box; `true` a 1x1 one that does not. */
  icon?: boolean | 'square'
  advertises?: (Pick<FeedCandidate, 'url'> & Partial<FeedCandidate>)[]
  /** The posts it will answer with (a default single post if not given). */
  items?: FeedItem[]
  /** Answered as the feed's validator, so that asking again with it gets `not-modified`. */
  etag?: string
}

/**
 * In-memory fake. Knows the feeds it is given; anything else is "not a feed" unless `fallback`
 * answers for it. Records every address it was asked about.
 */
export class FakeFeedFetcher implements FeedFetcher {
  readonly inspected: string[] = []
  readonly discovered: string[] = []
  readonly itemsRead: string[] = []
  readonly iconsFetched: string[] = []

  constructor(
    private readonly feeds: Record<string, KnownFeed> = {},
    private readonly fallback?: (address: string) => KnownFeed | undefined,
  ) {}

  async inspect(address: string): Promise<FeedDetails> {
    this.inspected.push(address)
    const known = this.feeds[address] ?? this.fallback?.(address)
    if (address.includes('unreachable')) {
      throw new FeedError('unreachable', 'We couldn’t reach that address. Check it and try again.')
    }
    if (!known) {
      throw new FeedError('not-a-feed', 'That address doesn’t look like an RSS or Atom feed.')
    }
    return {
      url: known.url ?? address,
      title: known.title ?? new URL(address).host,
      description: known.description ?? null,
      siteUrl: known.siteUrl ?? null,
      iconUrl: known.iconUrl ?? null,
      ...(known.icon ? { iconUrl: known.iconUrl ?? `${new URL(address).origin}/logo.png` } : {}),
    }
  }

  async discover(address: string): Promise<FeedCandidate[]> {
    this.discovered.push(address)
    const known = this.feeds[address] ?? this.fallback?.(address)
    if (address.includes('unreachable')) {
      throw new FeedError('unreachable', 'We couldn’t reach that address. Check it and try again.')
    }
    if (known?.advertises?.length) {
      return tidyCandidates(known.advertises.map((c) => ({ title: null, comments: false, ...c })))
    }
    if (!known) {
      throw new FeedError('not-a-feed', 'That address doesn’t look like an RSS or Atom feed.')
    }
    return [{ url: known.url ?? address, title: known.title ?? null, comments: false }]
  }

  async readItems(
    address: string,
    options: { validators?: FeedValidators } = {},
  ): Promise<FeedItemsResult> {
    this.itemsRead.push(address)
    const known = this.feeds[address] ?? this.fallback?.(address)
    if (address.includes('unreachable')) {
      throw new FeedError('unreachable', 'We couldn’t reach that address. Check it and try again.')
    }
    if (!known) {
      throw new FeedError('not-a-feed', 'That address doesn’t look like an RSS or Atom feed.')
    }
    const etag = known.etag ?? null
    if (etag && options.validators?.etag === etag) return { status: 'not-modified' }
    const items = known.items ?? [
      {
        id: `${address}#1`,
        title: `A post in ${known.title ?? new URL(address).host}`,
        url: `${new URL(address).origin}/post-1`,
        summary: null,
        authors: [],
        publishedAt: new Date().toISOString(), // so it counts as recent
      },
    ]
    return { status: 'modified', items: items.slice(0, MAX_FEED_ITEMS), validators: { etag } }
  }

  async fetchIcon(feed: FeedDetails): Promise<FetchedIcon | null> {
    this.iconsFetched.push(feed.url)
    const known = this.feeds[feed.url] ?? this.fallback?.(feed.url)
    if (!known?.icon) return null
    return { contentType: 'image/png', data: known.icon === 'square' ? SQUARE_PNG : TINY_PNG }
  }
}

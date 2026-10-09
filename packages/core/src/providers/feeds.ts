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

/**
 * In-memory fake. Knows the feeds it is given; anything else is "not a feed" unless `fallback`
 * answers for it. Records every address it was asked about.
 */
export class FakeFeedFetcher implements FeedFetcher {
  readonly inspected: string[] = []
  readonly iconsFetched: string[] = []

  constructor(
    private readonly feeds: Record<string, Partial<FeedDetails> & { icon?: boolean }> = {},
    private readonly fallback?: (
      address: string,
    ) => (Partial<FeedDetails> & { icon?: boolean }) | undefined,
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

  async fetchIcon(feed: FeedDetails): Promise<FetchedIcon | null> {
    this.iconsFetched.push(feed.url)
    const known = this.feeds[feed.url] ?? this.fallback?.(feed.url)
    return known?.icon ? { contentType: 'image/png', data: TINY_PNG } : null
  }
}

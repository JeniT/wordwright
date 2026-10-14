import type { FeedFetcher, FetchedIcon } from '@lfwa/core'

/** A slow site must not hold up saving a profile; the icon is a nicety. */
const SITE_ICON_TIMEOUT_MS = 5000

/**
 * The icon of a profile's website, or null. Never rejects: any failure (unreachable, blocked, slow, nothing usable)
 * just means no icon, and the profile is saved regardless. It is the feed fetcher's icon search (the site's declared
 * icons, then /favicon.ico), so the same address checks and size limits apply.
 */
export async function fetchSiteIcon(
  feeds: FeedFetcher,
  siteUrl: string,
  signal: AbortSignal = AbortSignal.timeout(SITE_ICON_TIMEOUT_MS),
): Promise<FetchedIcon | null> {
  try {
    return await feeds.fetchIcon(
      { url: siteUrl, title: siteUrl, description: null, siteUrl, iconUrl: null },
      { signal },
    )
  } catch {
    return null
  }
}

import type { FeedFetcher } from '@wordwright/core'
import { withShape, type ShapedIcon } from './icon-shape'

/** A slow site must not hold up saving a publication; the icon is a nicety. */
const SITE_ICON_TIMEOUT_MS = 5000

/**
 * The icon of a publication's website, or null. Never rejects: any failure (unreachable, blocked, slow, nothing usable)
 * just means no icon, and the publication is saved regardless. It is the feed fetcher's icon search (the site's declared
 * icons, then /favicon.ico), so the same address checks and size limits apply.
 */
export async function fetchSiteIcon(
  feeds: FeedFetcher,
  siteUrl: string,
  signal: AbortSignal = AbortSignal.timeout(SITE_ICON_TIMEOUT_MS),
): Promise<ShapedIcon | null> {
  try {
    return await withShape(
      await feeds.fetchIcon(
        { url: siteUrl, title: siteUrl, description: null, siteUrl, iconUrl: null },
        { signal },
      ),
    )
  } catch {
    return null
  }
}

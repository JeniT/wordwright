import { XMLParser } from 'fast-xml-parser'
import { FeedError, MAX_FEED_ITEMS, type FeedDetails, type FeedItem } from '@wordwright/core'

const TITLE_MAX = 200
const DESCRIPTION_MAX = 500
const SUMMARY_MAX = 400

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true, // <dc:title>, <atom:link> and friends are matched by local name
  textNodeName: '#text',
  // Feeds are untrusted. DOCTYPE entity tricks ("billion laughs") are the classic XML attack.
  // Real feeds are full of &amp; and &quot; (the Guardian's world feed has thousands), so the limits
  // on how many expansions are allowed must be generous. What stops a "billion laughs" bomb is the
  // cap on how much text expansion may produce in total, and on how deeply entities nest.
  processEntities: {
    enabled: true,
    maxTotalExpansions: 500_000,
    maxExpandedLength: 2_000_000,
    maxExpansionDepth: 3,
  },
  htmlEntities: true,
  trimValues: true,
})

type Node = Record<string, unknown>
const isNode = (v: unknown): v is Node => typeof v === 'object' && v !== null && !Array.isArray(v)
const list = (v: unknown): unknown[] => (v === undefined ? [] : Array.isArray(v) ? v : [v])

/** The text of an element, whether it parsed to a string, a number or `{ '#text': ..., '@_type': ... }`. */
function text(v: unknown): string | null {
  const first = list(v)[0]
  const raw = isNode(first) ? first['#text'] : first
  if (typeof raw !== 'string' && typeof raw !== 'number') return null
  return String(raw).trim() || null
}

/** Feed titles and descriptions are sometimes HTML; keep the words, drop the markup. */
function plain(v: string | null, max: number): string | null {
  if (!v) return null
  // Markup is dropped first and entities decoded after, so "&lt;b&gt;" stays the text "<b>".
  const words = v
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
  if (!words) return null
  return words.length <= max ? words : `${words.slice(0, max - 1).trimEnd()}…`
}

/** Resolves `href` against `base`; only web addresses survive. */
export function webUrl(href: unknown, base: string): string | null {
  const value = text(href)
  if (!value) return null
  try {
    const url = new URL(value, base)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

/** The Atom <link> that points at the website (not at the feed itself). */
function atomSiteLink(links: unknown[], base: string): string | null {
  const candidates = links.filter(isNode)
  const alternate =
    candidates.find((l) => l['@_rel'] === 'alternate') ??
    candidates.find((l) => l['@_rel'] === undefined)
  return webUrl(alternate?.['@_href'], base)
}

/**
 * Reads the channel details out of an RSS 2.0, RSS 1.0 (RDF) or Atom document. `address` is where
 * it was fetched from; relative links in the feed resolve against it. Throws `not-a-feed` for
 * anything else, including a feed with no title.
 */
export function parseFeed(xml: string, address: string): FeedDetails {
  let doc: unknown
  try {
    doc = parser.parse(xml)
  } catch {
    throw notAFeed()
  }
  if (!isNode(doc)) throw notAFeed()

  const rss = doc['rss']
  const rdf = doc['RDF']
  const atom = doc['feed']

  if (isNode(rss) || isNode(rdf)) {
    const root = isNode(rss) ? rss : (rdf as Node)
    const channel = list(root['channel']).find(isNode)
    if (!channel) throw notAFeed()
    // RSS 1.0 puts <image> beside the channel instead of inside it.
    const image = list(channel['image']).find(isNode) ?? list(root['image']).find(isNode)
    return details({
      address,
      title: text(channel['title']),
      description: text(channel['description']) ?? text(channel['subtitle']),
      siteUrl: webUrl(channel['link'], address) ?? atomSiteLink(list(channel['link']), address),
      iconUrl: webUrl(image?.['url'], address),
    })
  }
  if (isNode(atom)) {
    return details({
      address,
      title: text(atom['title']),
      description: text(atom['subtitle']) ?? text(atom['tagline']),
      siteUrl: atomSiteLink(list(atom['link']), address),
      // <logo> is the wide banner, <icon> the small square one; the icon suits a list best.
      iconUrl: webUrl(atom['icon'], address) ?? webUrl(atom['logo'], address),
    })
  }
  throw notAFeed()
}

/**
 * The posts in an RSS 2.0, RSS 1.0 or Atom document, as the feed lists them (newest first when the
 * feed gives dates), at most `MAX_FEED_ITEMS`. Only what the feed says is kept: a short plain-text
 * summary, never the article. Posts without an address we can use are skipped. Throws `not-a-feed`
 * for anything that isn't a feed.
 */
export function parseFeedItems(xml: string, address: string): FeedItem[] {
  let doc: unknown
  try {
    doc = parser.parse(xml)
  } catch {
    throw notAFeed()
  }
  if (!isNode(doc)) throw notAFeed()
  const rss = doc['rss']
  const rdf = doc['RDF']
  const atom = doc['feed']

  let raw: { node: Node; atom: boolean }[]
  if (isNode(rss) || isNode(rdf)) {
    const root = isNode(rss) ? rss : (rdf as Node)
    const channel = list(root['channel']).find(isNode)
    if (!channel) throw notAFeed()
    // RSS 1.0 lists items beside the channel, RSS 2.0 inside it.
    raw = [...list(channel['item']), ...list(root['item'])]
      .filter(isNode)
      .map((node) => ({ node, atom: false }))
  } else if (isNode(atom)) {
    raw = list(atom['entry'])
      .filter(isNode)
      .map((node) => ({ node, atom: true }))
  } else {
    throw notAFeed()
  }

  const seen = new Set<string>()
  const items: FeedItem[] = []
  for (const { node, atom: isAtom } of raw) {
    const url = isAtom ? atomItemLink(node, address) : webUrl(node['link'], address)
    if (!url) continue
    const id = (text(node['guid']) ?? text(node['id']) ?? url).slice(0, 500)
    if (seen.has(id)) continue
    seen.add(id)
    const authors = isAtom
      ? list(node['author']).map((a) => (isNode(a) ? text(a['name']) : text(a)))
      : [...list(node['creator']), ...list(node['author'])].map((a) => text(a))
    items.push({
      id,
      title: plain(text(node['title']), TITLE_MAX) ?? url,
      url,
      summary: plain(
        text(node['summary']) ??
          text(node['description']) ??
          text(node['encoded']) ??
          text(node['content']),
        SUMMARY_MAX,
      ),
      authors: [
        ...new Set(authors.map((a) => personName(a)).filter((a): a is string => !!a)),
      ].slice(0, 5),
      publishedAt: isoDate(
        text(node['published']) ??
          text(node['pubDate']) ??
          text(node['date']) ??
          text(node['updated']),
      ),
    })
  }
  // Newest first when we can tell; otherwise the order the feed uses, which is almost always that.
  const dated = items.map((item, i) => ({
    item,
    i,
    t: item.publishedAt ? Date.parse(item.publishedAt) : null,
  }))
  dated.sort((a, b) => (b.t ?? -Infinity) - (a.t ?? -Infinity) || a.i - b.i)
  return (dated.some((d) => d.t !== null) ? dated.map((d) => d.item) : items).slice(
    0,
    MAX_FEED_ITEMS,
  )
}

/** An Atom entry's link to the post itself (not its "edit" or "replies" links). */
function atomItemLink(entry: Node, base: string): string | null {
  const links = list(entry['link']).filter(isNode)
  const pick =
    links.find((l) => l['@_rel'] === 'alternate') ?? links.find((l) => l['@_rel'] === undefined)
  return webUrl(pick?.['@_href'], base)
}

/** RSS authors are often "me@example.com (Ada Lovelace)"; keep the name, never an email address. */
function personName(v: string | null): string | null {
  if (!v) return null
  const inBrackets = /\(([^)]+)\)/.exec(v)?.[1]
  const name = plain(inBrackets ?? v, 100)
  return name && !name.includes('@') ? name : null
}

function isoDate(v: string | null): string | null {
  if (!v) return null
  const t = Date.parse(v)
  return Number.isNaN(t) ? null : new Date(t).toISOString()
}

function details(d: {
  address: string
  title: string | null
  description: string | null
  siteUrl: string | null
  iconUrl: string | null
}): FeedDetails {
  const title = plain(d.title, TITLE_MAX)
  if (!title) throw notAFeed()
  return {
    url: d.address,
    title,
    description: plain(d.description, DESCRIPTION_MAX),
    siteUrl: d.siteUrl,
    iconUrl: d.iconUrl,
  }
}

const notAFeed = () =>
  new FeedError(
    'not-a-feed',
    'That address doesn’t look like an RSS or Atom feed. Look for a link or button called “RSS” or “Subscribe” on the site, and paste that address instead.',
  )

export interface PageLinks {
  /** Feeds the page advertises, best first. */
  feeds: string[]
  /** The same feeds with what the page calls each, in page order. */
  feedLinks: { url: string; title: string | null }[]
  /** Icons the page advertises, best first. */
  icons: string[]
}

/** Finds the feed and icon links a web page declares in its <head>. */
export function parseHtmlLinks(html: string, base: string): PageLinks {
  const feedLinks: { url: string; title: string | null }[] = []
  const icons: { href: string; rank: number }[] = []
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const attr = (name: string) =>
      new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)
    const value = (name: string) => {
      const m = attr(name)
      return (m?.[1] ?? m?.[2] ?? m?.[3] ?? '').trim()
    }
    const rel = value('rel').toLowerCase().split(/\s+/)
    const type = value('type').toLowerCase()
    const href = webUrl(value('href').replace(/&amp;/g, '&'), base)
    if (!href) continue
    if (rel.includes('alternate') && /^application\/(rss|atom)\+xml$/.test(type)) {
      const title = value('title').replace(/&amp;/g, '&').replace(/\s+/g, ' ')
      feedLinks.push({ url: href, title: title || null })
    } else if (rel.includes('apple-touch-icon')) icons.push({ href, rank: 0 })
    else if (rel.includes('icon')) icons.push({ href, rank: type === 'image/svg+xml' ? 3 : 1 })
  }
  return {
    feeds: feedLinks.map((f) => f.url),
    feedLinks,
    // SVG is not accepted as an icon (it can carry script), so it only counts if nothing else does.
    icons: icons.sort((a, b) => a.rank - b.rank).map((i) => i.href),
  }
}

import { lookup as dnsLookup } from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import { isIP } from 'node:net'
import {
  detectIconType,
  FeedError,
  MAX_ICON_BYTES,
  type FeedDetails,
  type FeedFetcher,
  type FetchedIcon,
} from '@lfwa/core'
import { isPublicAddress } from './addresses'
import { parseFeed, parseHtmlLinks, webUrl } from './parse-feed'

export interface HttpFeedFetcherOptions {
  /** Seconds are too long to make a person wait; feeds that are slower than this are unusable anyway. */
  timeoutMs?: number
  /** Largest feed or page we will read. */
  maxBytes?: number
  maxRedirects?: number
  /** Tests only: lets the fetcher reach 127.0.0.1, where its test server listens. */
  allowPrivateAddresses?: boolean
}

interface Response {
  url: string
  contentType: string
  body: Buffer
}

const USER_AGENT = 'LongFormWritingAssistant/1.0 (feed reader)'

/**
 * Reads feeds over HTTP(S) with `node:http(s)`, so no dependency is needed for the one thing that
 * matters here: every connection goes through our own DNS lookup, which refuses non-public
 * addresses. Checking the name first and connecting later would let a hostile DNS server answer
 * differently the second time; checking in the connection's own lookup does not.
 */
export class HttpFeedFetcher implements FeedFetcher {
  private readonly timeoutMs: number
  private readonly maxBytes: number
  private readonly maxRedirects: number
  private readonly allowPrivate: boolean

  constructor(options: HttpFeedFetcherOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 10_000
    this.maxBytes = options.maxBytes ?? 3 * 1024 * 1024
    this.maxRedirects = options.maxRedirects ?? 5
    this.allowPrivate = options.allowPrivateAddresses ?? false
  }

  async inspect(address: string, options: { signal?: AbortSignal } = {}): Promise<FeedDetails> {
    const first = await this.get(address, this.maxBytes, options.signal)
    const asFeed = tryParse(first, address)
    if (asFeed) return asFeed

    // Not a feed. If it's a web page that points at one (what people paste when they paste "the
    // site"), use that feed. One hop only: a page never leads us on a chain of fetches.
    const [advertised] = parseHtmlLinks(first.body.toString('utf8'), first.url).feeds
    if (advertised) {
      const second = await this.get(advertised, this.maxBytes, options.signal)
      const found = tryParse(second, advertised)
      if (found) return found
    }
    throw new FeedError(
      'not-a-feed',
      'That address doesn’t look like an RSS or Atom feed. Look for a link or button called “RSS” or “Subscribe” on the site, and paste that address instead.',
    )
  }

  async fetchIcon(
    feed: FeedDetails,
    options: { signal?: AbortSignal } = {},
  ): Promise<FetchedIcon | null> {
    const candidates = new Set<string>()
    if (feed.iconUrl) candidates.add(feed.iconUrl)
    if (feed.siteUrl) {
      // Feeds often have no logo of their own; the site's icon is the next best thing.
      const page = await this.get(feed.siteUrl, this.maxBytes, options.signal).catch(() => null)
      if (page)
        for (const href of parseHtmlLinks(page.body.toString('utf8'), page.url).icons)
          candidates.add(href)
      candidates.add(new URL('/favicon.ico', feed.siteUrl).href)
    }
    for (const candidate of [...candidates].slice(0, 5)) {
      const response = await this.get(candidate, MAX_ICON_BYTES, options.signal).catch(() => null)
      if (!response) continue
      // The bytes decide what it is, never the Content-Type the other server claims.
      const contentType = detectIconType(response.body)
      if (contentType) return { contentType, data: new Uint8Array(response.body) }
    }
    return null
  }

  /** GET with redirects followed by hand, so every hop is checked, with time and size limits. */
  private async get(address: string, maxBytes: number, signal?: AbortSignal): Promise<Response> {
    let url = address
    for (let hop = 0; hop <= this.maxRedirects; hop++) {
      const result = await this.once(url, maxBytes, signal)
      if (!('redirect' in result)) return result
      const next = webUrl(result.redirect, url)
      if (!next) throw unreachable()
      url = next
    }
    throw new FeedError(
      'unreachable',
      'That address sends us round in circles. Check it and try again.',
    )
  }

  private once(
    address: string,
    maxBytes: number,
    outerSignal?: AbortSignal,
  ): Promise<Response | { redirect: string }> {
    return new Promise((resolve, reject) => {
      let url: URL
      try {
        url = new URL(address)
      } catch {
        return reject(unreachable())
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return reject(unreachable())
      // An address written as numbers never goes through the lookup below, so check it here.
      const host = url.hostname.replace(/^\[|\]$/g, '')
      if (isIP(host) && !this.allowPrivate && !isPublicAddress(host))
        return reject(blockedAddress())

      const signal = AbortSignal.any([
        AbortSignal.timeout(this.timeoutMs),
        ...(outerSignal ? [outerSignal] : []),
      ])
      const request = (url.protocol === 'https:' ? https : http).request(
        url,
        {
          method: 'GET',
          signal,
          headers: {
            'user-agent': USER_AGENT,
            accept:
              'application/atom+xml, application/rss+xml, application/xml, text/xml, text/html;q=0.8, image/*;q=0.8, */*;q=0.5',
            'accept-encoding': 'identity', // so the size we count is the size we hold
          },
          lookup: (hostname, lookupOptions, callback) => {
            dnsLookup(hostname, { ...lookupOptions, all: true }, (err, addresses) => {
              if (err) return callback(err, '', 4)
              const list = addresses as { address: string; family: number }[]
              if (!this.allowPrivate && list.some((a) => !isPublicAddress(a.address))) {
                return callback(new BlockedError(), '', 4)
              }
              if ((lookupOptions as { all?: boolean }).all) {
                return (callback as unknown as (e: null, a: typeof list) => void)(null, list)
              }
              callback(null, list[0]!.address, list[0]!.family)
            })
          },
        },
        (res) => {
          const status = res.statusCode ?? 0
          const location = res.headers.location
          if ([301, 302, 303, 307, 308].includes(status) && location) {
            res.resume()
            return resolve({ redirect: location })
          }
          if (status < 200 || status >= 300) {
            res.resume()
            return reject(
              new FeedError(
                'unreachable',
                status === 404
                  ? 'There’s nothing at that address (404). Check it and try again.'
                  : `That site answered with an error (${status}). Check the address, or try again later.`,
              ),
            )
          }
          const chunks: Buffer[] = []
          let size = 0
          res.on('data', (chunk: Buffer) => {
            size += chunk.length
            if (size > maxBytes) {
              res.destroy()
              reject(
                new FeedError(
                  'too-large',
                  'That address returns far more data than a feed should, so we didn’t use it.',
                ),
              )
              return
            }
            chunks.push(chunk)
          })
          res.on('end', () =>
            resolve({
              url: url.href,
              contentType: String(res.headers['content-type'] ?? ''),
              body: Buffer.concat(chunks),
            }),
          )
          res.on('error', () => reject(unreachable()))
        },
      )
      request.on('error', (err) =>
        reject(
          // A blocked lookup surfaces here, possibly wrapped by the socket layer.
          err instanceof BlockedError || (err as { cause?: unknown }).cause instanceof BlockedError
            ? blockedAddress()
            : signal.aborted
              ? new FeedError('unreachable', 'That site took too long to answer. Try again later.')
              : unreachable(),
        ),
      )
      request.end()
    })
  }
}

class BlockedError extends Error {}

const unreachable = () =>
  new FeedError('unreachable', 'We couldn’t reach that address. Check it and try again.')
const blockedAddress = () =>
  new FeedError(
    'blocked',
    'That address points to a private network, so we can’t read it. Use the public address of the feed.',
  )

/**
 * `address` is what we were asked to read, and is what gets stored: redirects can lead through
 * temporary or tracking addresses (a cookie check, say) that mustn't become the feed's identity.
 * Links inside the feed resolve against where the document really came from.
 */
function tryParse(response: Response, address: string): FeedDetails | null {
  try {
    return { ...parseFeed(response.body.toString('utf8'), response.url), url: address }
  } catch (err) {
    if (err instanceof FeedError) return null
    throw err
  }
}

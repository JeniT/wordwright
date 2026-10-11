import { lookup as dnsLookup } from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import { isIP } from 'node:net'
import type { PageInfo, PageInfoFetcher } from '@lfwa/core'
import { isPublicAddress } from './addresses'
import { extractAuthors } from './authors'
import { extractTitle } from './title'

type Lookup = typeof dnsLookup

export interface HttpPageInfoOptions {
  /** Overall limit for one address, redirects included. */
  timeoutMs?: number
  /** How much of a page to read looking for its title. */
  maxBytes?: number
  maxRedirects?: number
  /** Only ports 80 and 443 are contacted (a link to some other port just gets no title). Tests turn this off. */
  restrictPorts?: boolean
  /** Replaceable so tests can stand in for DNS. */
  lookup?: Lookup
  /** Replaceable so tests can reach a server on this machine. Production uses `isPublicAddress`. */
  allowAddress?: (address: string) => boolean
}

class NotPublicError extends Error {
  readonly code = 'ENOTPUBLIC'
}

type Hop = { redirect: string } | { html: string } | { none: true }

/**
 * Reads a page's title over HTTP(S). Because it fetches addresses typed by users, it is built to
 * never touch private networks (SSRF): the addresses a name resolves to are checked at the moment
 * of connecting, so a name can't be pointed at an internal address after the check (DNS rebinding);
 * redirects are followed by hand, each hop checked afresh; and the request is capped in time and size.
 * Every failure is reported as "no title", never thrown.
 */
export class HttpPageInfoFetcher implements PageInfoFetcher {
  private readonly timeoutMs: number
  private readonly maxBytes: number
  private readonly maxRedirects: number
  private readonly restrictPorts: boolean
  private readonly resolve: Lookup
  private readonly allow: (address: string) => boolean

  constructor(options: HttpPageInfoOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 5000
    this.maxBytes = options.maxBytes ?? 256 * 1024
    this.maxRedirects = options.maxRedirects ?? 4
    this.restrictPorts = options.restrictPorts ?? true
    this.resolve = options.lookup ?? dnsLookup
    this.allow = options.allowAddress ?? isPublicAddress
  }

  async fetchInfo(url: string, signal?: AbortSignal): Promise<PageInfo> {
    const deadline = AbortSignal.timeout(this.timeoutMs)
    const combined = signal ? AbortSignal.any([signal, deadline]) : deadline
    if (combined.aborted) return { title: null }
    try {
      let current = new URL(url)
      for (let hop = 0; ; hop++) {
        const result = await this.visit(current, combined)
        if ('html' in result) {
          const authors = extractAuthors(result.html)
          return authors.length
            ? { title: extractTitle(result.html), authors }
            : { title: extractTitle(result.html) }
        }
        if ('none' in result) return { title: null }
        if (hop >= this.maxRedirects) return { title: null }
        current = new URL(result.redirect, current)
      }
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code === 'ENOTFOUND') return { title: null, problem: 'not-found' }
      if (code === 'ENOTPUBLIC') return { title: null, problem: 'not-public' }
      return { title: null }
    }
  }

  /** Called with every connection's host name; refuses to connect to anything not public. */
  private readonly safeLookup = ((
    hostname: string,
    options: { all?: boolean },
    callback: (...args: unknown[]) => void,
  ) => {
    this.resolve(hostname, { all: true, verbatim: true }, (err, addresses) => {
      if (err) return callback(err)
      if (!addresses.length) {
        return callback(Object.assign(new Error('not found'), { code: 'ENOTFOUND' }))
      }
      if (!addresses.every((a) => this.allow(a.address))) return callback(new NotPublicError())
      if (options.all) callback(null, addresses)
      else callback(null, addresses[0]!.address, addresses[0]!.family)
    })
  }) as Lookup

  private visit(url: URL, signal: AbortSignal): Promise<Hop> {
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
      return Promise.resolve({ none: true })
    if (this.restrictPorts && url.port && url.port !== '80' && url.port !== '443') {
      return Promise.resolve({ none: true })
    }
    // An address given as numbers skips DNS, so it never reaches `safeLookup`: check it here.
    const literal = url.hostname.replace(/^\[|\]$/g, '')
    if (isIP(literal) && !this.allow(literal)) return Promise.reject(new NotPublicError())

    return new Promise<Hop>((resolve, reject) => {
      const transport = url.protocol === 'https:' ? https : http
      const req = transport.request(
        url,
        {
          method: 'GET',
          signal,
          lookup: this.safeLookup,
          // No cookies or credentials are ever sent, and compression is off so the size cap is real.
          headers: {
            'user-agent': 'Wordwright/1.0 (reads page titles for saved links)',
            accept: 'text/html,application/xhtml+xml',
            'accept-encoding': 'identity',
          },
        },
        (res) => {
          const status = res.statusCode ?? 0
          const location = res.headers.location
          if ([301, 302, 303, 307, 308].includes(status) && location) {
            res.resume()
            return resolve({ redirect: location })
          }
          const type = String(res.headers['content-type'] ?? '')
          if (status < 200 || status >= 300 || (type && !/html/i.test(type))) {
            res.destroy()
            return resolve({ none: true })
          }
          let decoder: TextDecoder
          try {
            const charset = /charset=["']?([\w-]+)/i.exec(type)?.[1]
            decoder = new TextDecoder(charset ?? 'utf-8')
          } catch {
            decoder = new TextDecoder('utf-8')
          }
          let text = ''
          let bytes = 0
          const finish = () => {
            res.destroy()
            resolve({ html: text })
          }
          res.on('data', (chunk: Buffer) => {
            bytes += chunk.length
            text += decoder.decode(chunk, { stream: true })
            // The title and who wrote the page are in the head, so stop once it is complete.
            if (bytes >= this.maxBytes || /<\/head\s*>/i.test(text)) {
              finish()
            }
          })
          res.on('end', finish)
          res.on('error', reject)
        },
      )
      req.on('error', reject)
      req.end()
    })
  }
}

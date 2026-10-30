import { lookup as dnsLookup } from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import { isIP } from 'node:net'
import { isPublicAddress } from './addresses'

type Lookup = typeof dnsLookup

export interface SafeReaderOptions {
  /** Overall limit for one address, redirects included. */
  timeoutMs: number
  /** How much of a page to read at most. */
  maxBytes: number
  maxRedirects?: number
  /** Only ports 80 and 443 are contacted (a link to some other port is not read). Tests turn this off. */
  restrictPorts?: boolean
  /** Replaceable so tests can stand in for DNS. */
  lookup?: Lookup
  /** Replaceable so tests can reach a server on this machine. Production uses `isPublicAddress`. */
  allowAddress?: (address: string) => boolean
}

class NotPublicError extends Error {
  readonly code = 'ENOTPUBLIC'
}

/** What reading a page gave: its HTML (as much as was wanted), or nothing usable. */
export type Read = { html: string } | { none: true }

/** Reading stops as soon as this says it has enough of what has arrived so far. */
export type StopWhen = (htmlSoFar: string) => boolean

type Hop = { redirect: string } | Read

/**
 * Reads web pages over HTTP(S) for the fetchers that look at pages people link to. Because those addresses are
 * typed by users, it is built to never touch private networks (SSRF): the addresses a name resolves to are
 * checked at the moment of connecting, so a name can't be pointed at an internal address after the check (DNS
 * rebinding); redirects are followed by hand, each hop checked afresh; and the request is capped in time and
 * size. It throws when the address is the problem (`ENOTFOUND`, `ENOTPUBLIC`) or the connection fails, and
 * answers `{ none: true }` for a page that isn't there or isn't HTML; callers turn those into their own answers.
 */
export class SafeReader {
  private readonly timeoutMs: number
  private readonly maxBytes: number
  private readonly maxRedirects: number
  private readonly restrictPorts: boolean
  private readonly resolve: Lookup
  private readonly allow: (address: string) => boolean

  constructor(
    options: SafeReaderOptions,
    private readonly userAgent: string,
  ) {
    this.timeoutMs = options.timeoutMs
    this.maxBytes = options.maxBytes
    this.maxRedirects = options.maxRedirects ?? 4
    this.restrictPorts = options.restrictPorts ?? true
    this.resolve = options.lookup ?? dnsLookup
    this.allow = options.allowAddress ?? isPublicAddress
  }

  async read(url: string, signal?: AbortSignal, stopWhen?: StopWhen): Promise<Read> {
    const deadline = AbortSignal.timeout(this.timeoutMs)
    const combined = signal ? AbortSignal.any([signal, deadline]) : deadline
    if (combined.aborted) return { none: true }
    let current = new URL(url)
    for (let hop = 0; ; hop++) {
      const result = await this.visit(current, combined, stopWhen)
      if (!('redirect' in result)) return result
      if (hop >= this.maxRedirects) return { none: true }
      current = new URL(result.redirect, current)
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

  private visit(url: URL, signal: AbortSignal, stopWhen?: StopWhen): Promise<Hop> {
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
            'user-agent': this.userAgent,
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
            if (bytes >= this.maxBytes || stopWhen?.(text)) finish()
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

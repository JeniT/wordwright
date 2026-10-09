import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, describe, expect, it } from 'vitest'
import { pageInfoFetcherContract } from '@lfwa/core/testing'
import { HttpPageInfoFetcher, type HttpPageInfoOptions } from './http-page-info'

const requests: { path: string; headers: http.IncomingHttpHeaders }[] = []
const server = http.createServer((req, res) => {
  requests.push({ path: req.url!, headers: req.headers })
  const send = (status: number, type: string, body: string, headers = {}) => {
    res.writeHead(status, { 'content-type': type, ...headers })
    res.end(body)
  }
  switch (req.url) {
    case '/titled':
      return send(200, 'text/html; charset=utf-8', '<html><head><title>A fine page</title></head>')
    case '/untitled':
      return send(200, 'text/html', '<html><head></head><body>Nothing</body></html>')
    case '/latin1':
      res.writeHead(200, { 'content-type': 'text/html; charset=iso-8859-1' })
      return res.end(Buffer.from('<title>Caf\xe9</title>', 'latin1'))
    case '/json':
      return send(200, 'application/json', '{"title":"<title>no</title>"}')
    case '/forbidden':
      return send(403, 'text/html', '<title>Just a moment...</title>')
    case '/redirect':
      return send(302, 'text/plain', '', { location: '/titled' })
    case '/loop':
      return send(302, 'text/plain', '', { location: '/loop' })
    case '/to-private':
      return send(302, 'text/plain', '', { location: 'http://private.test/titled' })
    case '/slow':
      return // never answers
    case '/huge':
      res.writeHead(200, { 'content-type': 'text/html' })
      return res.end(`<html><body>${'x'.repeat(2_000_000)}</body><title>too late</title>`)
    default:
      return send(404, 'text/html', '<title>Not found</title>')
  }
})
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
afterAll(() => new Promise((resolve) => server.close(() => resolve(undefined))))
const port = (server.address() as AddressInfo).port

/** Stands in for DNS: every `*.test` name is this machine, except names containing "missing". */
const fakeDns = ((host: string, _o: unknown, cb: (...a: unknown[]) => void) => {
  if (host.includes('missing')) return cb(Object.assign(new Error('nx'), { code: 'ENOTFOUND' }))
  if (host.startsWith('private.')) return cb(null, [{ address: '10.0.0.5', family: 4 }])
  cb(null, [{ address: '127.0.0.1', family: 4 }])
}) as unknown as NonNullable<HttpPageInfoOptions['lookup']>

/** A fetcher allowed to reach this machine's loopback, which the test server needs. */
const create = (options: HttpPageInfoOptions = {}) =>
  new HttpPageInfoFetcher({
    lookup: fakeDns,
    restrictPorts: false,
    allowAddress: (address) => address === '127.0.0.1',
    ...options,
  })
const at = (path: string, host = 'site.test') => `http://${host}:${port}${path}`

pageInfoFetcherContract('http', () => create(), {
  titled: { url: at('/titled'), title: 'A fine page' },
  untitled: at('/untitled'),
  missing: at('/titled', 'missing.test'),
})

describe('HttpPageInfoFetcher', () => {
  it('follows redirects', async () => {
    expect(await create().fetchInfo(at('/redirect'))).toEqual({ title: 'A fine page' })
  })

  it('gives up on redirect loops', async () => {
    expect(await create().fetchInfo(at('/loop'))).toEqual({ title: null })
  })

  it('reads the declared character set', async () => {
    expect(await create().fetchInfo(at('/latin1'))).toEqual({ title: 'Café' })
  })

  it.each(['/json', '/forbidden', '/nothing-here'])('gives no title for %s', async (path) => {
    expect(await create().fetchInfo(at(path))).toEqual({ title: null })
  })

  it('identifies itself, asks for plain HTML and sends no cookies or credentials', async () => {
    requests.length = 0
    await create().fetchInfo(at('/titled'))
    const headers = requests[0]!.headers
    expect(headers['user-agent']).toMatch(/LongFormWritingAssistant/)
    expect(headers['accept-encoding']).toBe('identity')
    expect(headers.cookie).toBeUndefined()
    expect(headers.authorization).toBeUndefined()
  })

  it('stops waiting for a server that never answers', async () => {
    const started = Date.now()
    expect(await create({ timeoutMs: 150 }).fetchInfo(at('/slow'))).toEqual({ title: null })
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it('stops reading a huge page rather than downloading it all', async () => {
    expect(await create({ maxBytes: 10_000 }).fetchInfo(at('/huge'))).toEqual({ title: null })
  })

  it('gives up when the caller does', async () => {
    const controller = new AbortController()
    const pending = create().fetchInfo(at('/slow'), controller.signal)
    setTimeout(() => controller.abort(), 50)
    expect(await pending).toEqual({ title: null })
  })

  describe('never contacts private networks', () => {
    const before = () => requests.length

    it('refuses a name that resolves to a private address', async () => {
      const count = before()
      const strict = new HttpPageInfoFetcher({ lookup: fakeDns, restrictPorts: false })
      expect(await strict.fetchInfo(at('/titled', 'private.test'))).toEqual({
        title: null,
        problem: 'not-public',
      })
      expect(requests.length).toBe(count)
    })

    it('refuses loopback by default, even when a name resolves to it', async () => {
      const count = before()
      const strict = new HttpPageInfoFetcher({ lookup: fakeDns, restrictPorts: false })
      expect(await strict.fetchInfo(at('/titled'))).toEqual({ title: null, problem: 'not-public' })
      expect(requests.length).toBe(count)
    })

    it.each([
      'http://127.0.0.1/',
      'http://[::1]/',
      'http://10.1.2.3/',
      'http://169.254.169.254/latest/meta-data/',
    ])('refuses the address %s without a lookup', async (url) => {
      const strict = new HttpPageInfoFetcher({ lookup: fakeDns })
      expect(await strict.fetchInfo(url)).toEqual({ title: null, problem: 'not-public' })
    })

    it('re-checks every redirect, so a public page cannot bounce us inward', async () => {
      const count = before()
      const info = await create().fetchInfo(at('/to-private'))
      expect(info.title).toBeNull()
      expect(requests.length).toBe(count + 1) // the redirect itself, and nothing after it
    })

    it('only contacts ports 80 and 443 unless told otherwise', async () => {
      const count = before()
      const strict = new HttpPageInfoFetcher({ lookup: fakeDns, allowAddress: () => true })
      expect(await strict.fetchInfo(at('/titled'))).toEqual({ title: null })
      expect(requests.length).toBe(count)
    })

    it('only speaks http and https', async () => {
      for (const url of ['file:///etc/passwd', 'ftp://example.org/', 'gopher://example.org/']) {
        expect(await create().fetchInfo(url), url).toEqual({ title: null })
      }
    })
  })

  describe('bad input', () => {
    it('treats an unparseable address as no title', async () => {
      expect(await create().fetchInfo('not a url')).toEqual({ title: null })
    })
  })
})

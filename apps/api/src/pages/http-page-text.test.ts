import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, describe, expect, it } from 'vitest'
import { PAGE_TEXT_MAX_CHARS } from '@lfwa/core'
import { pageTextFetcherContract } from '@lfwa/core/testing'
import { HttpPageTextFetcher, type HttpPageTextOptions } from './http-page-text'

const article = (title: string | null, body: string) =>
  `<html><head>${title ? `<title>${title}</title>` : ''}<style>x{}</style></head><body><nav>Menu</nav><article><p>${body}</p></article></body></html>`
const WORDS = 'The garden changes with the seasons, and so do we. '

const requests: http.IncomingHttpHeaders[] = []
const server = http.createServer((req, res) => {
  requests.push(req.headers)
  const send = (status: number, type: string, body: string, headers = {}) => {
    res.writeHead(status, { 'content-type': type, ...headers })
    res.end(body)
  }
  switch (req.url) {
    case '/post':
      return send(200, 'text/html; charset=utf-8', article('A fine post', WORDS.repeat(8)))
    case '/untitled':
      return send(200, 'text/html', article(null, WORDS.repeat(8)))
    case '/long':
      return send(200, 'text/html', article('Long', WORDS.repeat(400)))
    case '/redirect':
      return send(302, 'text/plain', '', { location: '/post' })
    case '/to-private':
      return send(302, 'text/plain', '', { location: 'http://private.test/post' })
    case '/empty':
      return send(200, 'text/html', '<html><body><script>render()</script></body></html>')
    case '/json':
      return send(200, 'application/json', '{"text":"nope"}')
    case '/slow':
      return // never answers
    case '/huge':
      res.writeHead(200, { 'content-type': 'text/html' })
      return res.end(
        `<html><body><article><p>${WORDS}</p>${'x'.repeat(3_000_000)}</article></body>`,
      )
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
}) as unknown as NonNullable<HttpPageTextOptions['lookup']>

/** A fetcher allowed to reach this machine's loopback, which the test server needs. */
const create = (options: HttpPageTextOptions = {}) =>
  new HttpPageTextFetcher({
    lookup: fakeDns,
    restrictPorts: false,
    allowAddress: (address) => address === '127.0.0.1',
    ...options,
  })
const at = (path: string, host = 'site.test') => `http://${host}:${port}${path}`

pageTextFetcherContract('http', () => create(), {
  readable: at('/post'),
  untitled: at('/untitled'),
  long: at('/long'),
  missing: at('/post', 'missing.test'),
})

describe('HttpPageTextFetcher', () => {
  it('reads the title and the article, without the menu', async () => {
    const page = await create().fetchText(at('/post'))
    expect(page).toMatchObject({ ok: true, title: 'A fine post', truncated: false })
    expect(page.ok && page.text).toContain('The garden changes with the seasons')
    expect(page.ok && page.text).not.toContain('Menu')
  })

  it('follows redirects, but never into a private network', async () => {
    expect(await create().fetchText(at('/redirect'))).toMatchObject({ ok: true })
    expect(await create().fetchText(at('/to-private'))).toEqual({
      ok: false,
      problem: 'not-public',
    })
  })

  it('refuses a private address given as numbers or as a name, without connecting', async () => {
    requests.length = 0
    const strict = new HttpPageTextFetcher({ restrictPorts: false })
    expect(await strict.fetchText(`http://127.0.0.1:${port}/post`)).toEqual({
      ok: false,
      problem: 'not-public',
    })
    expect(await strict.fetchText(`http://[::1]:${port}/post`)).toEqual({
      ok: false,
      problem: 'not-public',
    })
    expect(await create().fetchText(at('/post', 'private.test'))).toEqual({
      ok: false,
      problem: 'not-public',
    })
    expect(requests).toHaveLength(0)
  })

  it('keeps at most the cap, cut at a word', async () => {
    const page = await create().fetchText(at('/long'))
    expect(page).toMatchObject({ ok: true, truncated: true })
    expect(page.ok && page.text.length).toBeLessThanOrEqual(PAGE_TEXT_MAX_CHARS + 1)
    expect(page.ok && page.text.endsWith('…')).toBe(true)
  })

  it.each(['/json', '/empty', '/nothing-here'])('cannot read %s', async (path) => {
    expect(await create().fetchText(at(path))).toEqual({ ok: false, problem: 'unreadable' })
  })

  it('identifies itself, asks for plain HTML and sends no cookies or credentials', async () => {
    requests.length = 0
    await create().fetchText(at('/post'))
    const headers = requests[0]!
    expect(headers['user-agent']).toMatch(/Wordwright/)
    expect(headers['accept-encoding']).toBe('identity')
    expect(headers.cookie).toBeUndefined()
    expect(headers.authorization).toBeUndefined()
  })

  it('stops waiting for a server that never answers, and for a page that is huge', async () => {
    const started = Date.now()
    expect(await create({ timeoutMs: 150 }).fetchText(at('/slow'))).toEqual({
      ok: false,
      problem: 'unreadable',
    })
    expect(Date.now() - started).toBeLessThan(2000)
    expect(await create({ maxBytes: 50_000 }).fetchText(at('/huge'))).toMatchObject({ ok: true })
  })
})

import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FeedError, TINY_PNG } from '@lfwa/core'
import { feedFetcherContract } from '@lfwa/core/testing'
import { isPublicAddress } from './addresses'
import { HttpFeedFetcher } from './http-feed-fetcher'
import { parseFeed, parseHtmlLinks } from './parse-feed'

const RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title><![CDATA[The Slow Reader]]></title>
  <description>&lt;p&gt;Essays on   reading &amp;amp; thinking&lt;/p&gt;</description>
  <link>https://slow.example/</link>
  <image><url>/logo.png</url><title>x</title></image>
  <item><title>First</title></item>
</channel></rss>`

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title type="text">Atom Notes</title>
  <subtitle>Short notes</subtitle>
  <link rel="self" href="https://atom.example/feed.atom"/>
  <link rel="alternate" href="/"/>
  <icon>/icon.png</icon>
  <logo>/banner.png</logo>
</feed>`

describe('parseFeed', () => {
  it('reads an RSS channel: title, plain-text description, site and logo', () => {
    expect(parseFeed(RSS, 'https://slow.example/feed')).toEqual({
      url: 'https://slow.example/feed',
      title: 'The Slow Reader',
      description: 'Essays on reading & thinking',
      siteUrl: 'https://slow.example/',
      iconUrl: 'https://slow.example/logo.png',
    })
  })

  it('reads an Atom feed, preferring its small icon and its alternate link', () => {
    expect(parseFeed(ATOM, 'https://atom.example/feed.atom')).toMatchObject({
      title: 'Atom Notes',
      description: 'Short notes',
      siteUrl: 'https://atom.example/',
      iconUrl: 'https://atom.example/icon.png',
    })
  })

  it('reads an RSS 1.0 (RDF) feed, where the image sits beside the channel', () => {
    const rdf = `<?xml version="1.0"?>
      <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/">
        <channel rdf:about="x"><title>Old Style</title><link>https://old.example/</link><description>d</description></channel>
        <image><url>https://old.example/i.gif</url></image>
      </rdf:RDF>`
    expect(parseFeed(rdf, 'https://old.example/rss')).toMatchObject({
      title: 'Old Style',
      iconUrl: 'https://old.example/i.gif',
    })
  })

  it('shortens very long text and ignores links that are not web addresses', () => {
    const xml = `<rss><channel><title>${'T'.repeat(500)}</title><link>javascript:alert(1)</link>
      <image><url>data:image/png;base64,AAAA</url></image></channel></rss>`
    const feed = parseFeed(xml, 'https://x.example/feed')
    expect(feed.title.length).toBeLessThanOrEqual(200)
    expect(feed.siteUrl).toBeNull()
    expect(feed.iconUrl).toBeNull()
  })

  it.each([
    ['an HTML page', '<html><body>Hello</body></html>'],
    ['plain text', 'just words'],
    ['XML that is not a feed', '<note><to>x</to></note>'],
    ['a feed with no title', '<rss><channel><description>d</description></channel></rss>'],
    ['nothing', ''],
  ])('refuses %s as not a feed', (_name, body) => {
    expect(() => parseFeed(body, 'https://x.example/')).toThrow(FeedError)
  })

  it('reads a big, real-world-sized feed that is full of escaped characters', () => {
    const items = Array.from(
      { length: 5000 },
      (_, i) => `<item><title>A &amp; B &quot;${i}&quot;</title></item>`,
    )
    const xml = `<rss><channel><title>Tom &amp; Jerry</title>${items.join('')}</channel></rss>`
    expect(parseFeed(xml, 'https://big.example/feed').title).toBe('Tom & Jerry')
  })

  it('survives an entity-expansion bomb without hanging or ballooning', () => {
    const bomb = `<?xml version="1.0"?><!DOCTYPE lolz [
      <!ENTITY a "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa">
      <!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">
      <!ENTITY c "&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;">
      <!ENTITY d "&c;&c;&c;&c;&c;&c;&c;&c;&c;&c;&c;&c;&c;&c;&c;&c;&c;&c;&c;&c;">
    ]><rss><channel><title>&d;&d;&d;&d;&d;&d;&d;&d;&d;&d;</title></channel></rss>`
    let result: unknown
    try {
      result = parseFeed(bomb, 'https://x.example/')
    } catch (err) {
      result = err
    }
    const title = (result as { title?: string }).title
    expect((title ?? '').length).toBeLessThanOrEqual(200)
  })
})

describe('parseHtmlLinks', () => {
  const html = `<html><head>
    <link rel="stylesheet" href="/a.css">
    <link rel="alternate" type="application/rss+xml" title="RSS" href="/feed.xml">
    <link rel='alternate' type='application/atom+xml' href='https://other.example/atom?a=1&amp;b=2'>
    <link rel="alternate" type="text/html" href="/fr">
    <link rel="icon" href="/favicon.ico">
    <link rel="shortcut icon" type="image/svg+xml" href="/icon.svg">
    <link rel="apple-touch-icon" href="/touch.png">
    <link rel="icon" href="javascript:alert(1)">
  </head></html>`

  it('finds advertised feeds and icons, best icon first, resolving relative addresses', () => {
    const { feeds, icons } = parseHtmlLinks(html, 'https://site.example/blog/')
    expect(feeds).toEqual(['https://site.example/feed.xml', 'https://other.example/atom?a=1&b=2'])
    expect(icons.slice(0, 2)).toEqual([
      'https://site.example/touch.png',
      'https://site.example/favicon.ico',
    ])
  })
})

describe('isPublicAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
    '::1',
    '::',
    'fe80::1',
    'fd00::1',
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.1',
    'not an ip',
  ])('refuses %s', (ip) => expect(isPublicAddress(ip)).toBe(false))

  it.each(['8.8.8.8', '93.184.216.34', '172.32.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8'])(
    'allows %s',
    (ip) => expect(isPublicAddress(ip)).toBe(true),
  )
})

/** A little web server with a few pages: the fixtures for the fetcher. */
function startSite() {
  const requests: string[] = []
  const server: Server = createServer((req, res) => {
    const path = req.url ?? '/'
    requests.push(path)
    const send = (type: string, body: string | Uint8Array, status = 200) => {
      res.writeHead(status, { 'content-type': type })
      res.end(body)
    }
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    if (path === '/feed.xml') return send('application/rss+xml', RSS)
    if (path === '/atom.xml') return send('application/atom+xml', ATOM)
    if (path === '/old-feed') {
      res.writeHead(301, { location: '/feed.xml' })
      return res.end()
    }
    if (path === '/loop') {
      res.writeHead(302, { location: '/loop' })
      return res.end()
    }
    if (path === '/site')
      return send(
        'text/html',
        `<html><head><link rel="alternate" type="application/rss+xml" href="/feed.xml"><link rel="icon" href="/site-icon.png"></head></html>`,
      )
    if (path === '/plain') return send('text/html', '<html><body>No feeds here</body></html>')
    if (path === '/huge')
      return send(
        'application/xml',
        `<rss><channel><title>t</title>${'x'.repeat(5000)}</channel></rss>`,
      )
    if (path === '/logo.png' || path === '/site-icon.png') return send('image/png', TINY_PNG)
    if (path === '/not-really-an-image.png') return send('image/png', 'hello')
    if (path === '/feed-with-logo')
      return send(
        'application/rss+xml',
        `<rss><channel><title>L</title><link>${base}/site</link><image><url>${base}/logo.png</url></image></channel></rss>`,
      )
    if (path === '/feed-with-fake-logo')
      return send(
        'application/rss+xml',
        `<rss><channel><title>L</title><link>${base}/plain</link><image><url>${base}/not-really-an-image.png</url></image></channel></rss>`,
      )
    if (path === '/feed-no-logo')
      return send(
        'application/rss+xml',
        `<rss><channel><title>L</title><link>${base}/site</link></channel></rss>`,
      )
    return send('text/plain', 'missing', 404)
  })
  return new Promise<{ base: string; requests: string[]; close: () => Promise<void> }>((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({
        base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        requests,
        close: () => new Promise((done) => server.close(() => done())),
      }),
    ),
  )
}

feedFetcherContract('http', async () => {
  const site = await startSite()
  return {
    fetcher: new HttpFeedFetcher({ allowPrivateAddresses: true }),
    feed: `${site.base}/feed.xml`,
    notAFeed: `${site.base}/plain`,
    unreachable: 'http://127.0.0.1:1/feed',
    close: site.close,
  }
})

describe('HttpFeedFetcher', () => {
  let site: Awaited<ReturnType<typeof startSite>>
  let fetcher: HttpFeedFetcher
  beforeAll(async () => {
    site = await startSite()
    fetcher = new HttpFeedFetcher({ allowPrivateAddresses: true, maxBytes: 2000 })
  })
  afterAll(() => site.close())

  it('reads RSS and Atom, and follows a redirect to the feed', async () => {
    expect((await fetcher.inspect(`${site.base}/atom.xml`)).title).toBe('Atom Notes')
    // The address asked for is the one kept, not wherever the redirect ended up.
    expect(await fetcher.inspect(`${site.base}/old-feed`)).toMatchObject({
      title: 'The Slow Reader',
      url: `${site.base}/old-feed`,
    })
  })

  it('finds the feed a web page advertises, and reports the feed’s own address', async () => {
    expect(await fetcher.inspect(`${site.base}/site`)).toMatchObject({
      title: 'The Slow Reader',
      url: `${site.base}/feed.xml`,
    })
  })

  it('says what is wrong: not a feed, missing, too big, or looping', async () => {
    await expect(fetcher.inspect(`${site.base}/plain`)).rejects.toMatchObject({
      reason: 'not-a-feed',
    })
    await expect(fetcher.inspect(`${site.base}/nothing-here`)).rejects.toMatchObject({
      reason: 'unreachable',
      message: expect.stringContaining('404'),
    })
    await expect(fetcher.inspect(`${site.base}/huge`)).rejects.toMatchObject({
      reason: 'too-large',
    })
    await expect(fetcher.inspect(`${site.base}/loop`)).rejects.toMatchObject({
      reason: 'unreachable',
    })
  })

  it('takes the logo the feed names', async () => {
    const feed = await fetcher.inspect(`${site.base}/feed-with-logo`)
    const icon = await fetcher.fetchIcon(feed)
    expect(icon?.contentType).toBe('image/png')
  })

  it('falls back to the website’s icon when the feed has none', async () => {
    const feed = await fetcher.inspect(`${site.base}/feed-no-logo`)
    expect(feed.iconUrl).toBeNull()
    expect((await fetcher.fetchIcon(feed))?.contentType).toBe('image/png')
    expect(site.requests).toContain('/site-icon.png')
  })

  it('decides what an icon is from its bytes, not from what the server says', async () => {
    const feed = await fetcher.inspect(`${site.base}/feed-with-fake-logo`)
    expect(await fetcher.fetchIcon(feed)).toBeNull()
  })

  it('refuses private addresses unless the test switch is on', async () => {
    const strict = new HttpFeedFetcher()
    for (const address of [
      `${site.base}/feed.xml`, // 127.0.0.1
      'http://localhost:1/feed',
      'http://[::1]:1/feed',
      'http://169.254.169.254/latest/meta-data/',
      'http://10.0.0.5/feed',
    ]) {
      await expect(strict.inspect(address), address).rejects.toMatchObject({ reason: 'blocked' })
    }
  })

  it('refuses addresses that are not http(s)', async () => {
    for (const address of ['file:///etc/passwd', 'ftp://x.example/feed', 'gopher://x']) {
      await expect(fetcher.inspect(address), address).rejects.toBeInstanceOf(FeedError)
    }
  })
})

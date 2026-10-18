import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FeedError, TINY_PNG } from '@wordwright/core'
import { feedFetcherContract } from '@wordwright/core/testing'
import { isPublicAddress } from './addresses'
import { HttpFeedFetcher } from './http-feed-fetcher'
import { parseFeed, parseFeedItems, parseHtmlLinks } from './parse-feed'

const RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title><![CDATA[The Slow Reader]]></title>
  <description>&lt;p&gt;Essays on   reading &amp;amp; thinking&lt;/p&gt;</description>
  <link>https://slow.example/</link>
  <image><url>/logo.png</url><title>x</title></image>
  <item><title>First</title><link>https://slow.example/first</link><guid>post-1</guid></item>
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

describe('parseFeedItems', () => {
  const address = 'https://blog.example/feed'
  const rss = (items: string) =>
    `<?xml version="1.0"?><rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>T</title>${items}</channel></rss>`

  it('reads RSS posts: id, title, address, plain short summary, authors, date', () => {
    const [post] = parseFeedItems(
      rss(`<item>
        <title>Hello &amp; welcome</title>
        <link>/posts/hello</link>
        <guid isPermaLink="false">abc-123</guid>
        <description>&lt;p&gt;Some &lt;b&gt;bold&lt;/b&gt; words &amp;amp; more.&lt;/p&gt;</description>
        <dc:creator>Ada Lovelace</dc:creator>
        <pubDate>Fri, 09 Oct 2026 10:00:00 GMT</pubDate>
      </item>`),
      address,
    )
    expect(post).toEqual({
      id: 'abc-123',
      title: 'Hello & welcome',
      url: 'https://blog.example/posts/hello',
      summary: 'Some bold words & more.',
      authors: ['Ada Lovelace'],
      publishedAt: '2026-10-09T10:00:00.000Z',
    })
  })

  it('keeps only the start of a long summary, and never the full article', () => {
    const body = 'word '.repeat(2000)
    const [post] = parseFeedItems(
      rss(
        `<item><title>Long</title><link>https://b.example/l</link><content:encoded><![CDATA[<p>${body}</p>]]></content:encoded></item>`,
      ),
      address,
    )
    expect(post!.summary!.length).toBeLessThanOrEqual(400)
    expect(post!.summary!.endsWith('…')).toBe(true)
  })

  it('reads Atom entries: the alternate link, summary, author name and published date', () => {
    const items = parseFeedItems(
      `<feed xmlns="http://www.w3.org/2005/Atom"><title>A</title>
        <entry><id>tag:x,1</id><title>One</title>
          <link rel="replies" href="/one/comments"/><link rel="alternate" href="/one"/>
          <summary>Short</summary><author><name>Bo Writer</name></author>
          <published>2026-10-08T09:00:00Z</published><updated>2026-10-09T09:00:00Z</updated></entry>
      </feed>`,
      address,
    )
    expect(items).toEqual([
      {
        id: 'tag:x,1',
        title: 'One',
        url: 'https://blog.example/one',
        summary: 'Short',
        authors: ['Bo Writer'],
        publishedAt: '2026-10-08T09:00:00.000Z',
      },
    ])
  })

  it('reads RSS 1.0, where the posts sit beside the channel', () => {
    const items = parseFeedItems(
      `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.rss.org/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
        <channel><title>R</title></channel>
        <item><title>Old style</title><link>https://r.example/1</link><dc:date>2026-01-02T00:00:00Z</dc:date></item>
      </rdf:RDF>`,
      address,
    )
    expect(items.map((i) => i.title)).toEqual(['Old style'])
  })

  it('never keeps an email address as an author, but keeps the name beside it', () => {
    const items = parseFeedItems(
      rss(`<item><title>A</title><link>https://b.example/a</link><author>ada@example.com (Ada Lovelace)</author></item>
           <item><title>B</title><link>https://b.example/b</link><author>bob@example.com</author></item>`),
      address,
    )
    expect(items.map((i) => i.authors)).toEqual([['Ada Lovelace'], []])
  })

  it('skips posts with no usable address, repeats, and addresses that are not web pages', () => {
    const items = parseFeedItems(
      rss(`<item><title>No link</title></item>
           <item><title>Script</title><link>javascript:alert(1)</link></item>
           <item><title>One</title><link>https://b.example/1</link><guid>g</guid></item>
           <item><title>One again</title><link>https://b.example/1b</link><guid>g</guid></item>`),
      address,
    )
    expect(items.map((i) => i.title)).toEqual(['One'])
  })

  it('puts the newest first when it has dates, keeps the feed’s order otherwise, and caps the list', () => {
    const dated = parseFeedItems(
      rss(`<item><title>Old</title><link>https://b.example/o</link><pubDate>Mon, 01 Jun 2026 00:00:00 GMT</pubDate></item>
           <item><title>New</title><link>https://b.example/n</link><pubDate>Mon, 01 Sep 2026 00:00:00 GMT</pubDate></item>`),
      address,
    )
    expect(dated.map((i) => i.title)).toEqual(['New', 'Old'])
    const many = parseFeedItems(
      rss(
        Array.from(
          { length: 80 },
          (_, i) => `<item><title>P${i}</title><link>https://b.example/${i}</link></item>`,
        ).join(''),
      ),
      address,
    )
    expect(many).toHaveLength(50)
    expect(many[0]!.title).toBe('P0')
  })

  it('refuses a document that is not a feed', () => {
    expect(() => parseFeedItems('<html><body>hi</body></html>', address)).toThrow(FeedError)
    expect(() => parseFeedItems('not xml at all', address)).toThrow(FeedError)
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

  it('keeps what the page calls each feed, in page order', () => {
    const { feedLinks } = parseHtmlLinks(html, 'https://site.example/blog/')
    expect(feedLinks).toEqual([
      { url: 'https://site.example/feed.xml', title: 'RSS' },
      { url: 'https://other.example/atom?a=1&b=2', title: null },
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
    if (path === '/feed.xml') {
      if (req.headers['if-none-match'] === '"v1"') {
        requests.push('304')
        res.writeHead(304)
        return res.end()
      }
      res.writeHead(200, {
        'content-type': 'application/rss+xml',
        etag: '"v1"',
        'last-modified': 'Fri, 09 Oct 2026 10:00:00 GMT',
      })
      return res.end(RSS)
    }
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
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
    if (path === '/multi')
      return send(
        'text/html',
        `<html><head>
        <link rel="alternate" type="application/rss+xml" title="Comments on Notes" href="/comments/feed">
        <link rel="alternate" type="application/rss+xml" title="Notes &amp; essays" href="/feed.xml">
        <link rel="alternate" type="application/atom+xml" title="Podcast" href="/atom.xml">
        <link rel="alternate" type="application/rss+xml" title="Notes again" href="/feed.xml">
        </head></html>`,
      )
    if (path === '/many')
      return send(
        'text/html',
        `<html><head>${Array.from({ length: 15 }, (_, i) => `<link rel="alternate" type="application/rss+xml" href="/f${i}.xml">`).join('')}</head></html>`,
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
    if (path === '/feed-logo-site-without-icon')
      return send(
        'application/rss+xml',
        `<rss><channel><title>L</title><link>${base}/plain</link><image><url>${base}/logo.png</url></image></channel></rss>`,
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
    page: {
      address: `${site.base}/multi`,
      posts: [`${site.base}/feed.xml`, `${site.base}/atom.xml`],
      comments: [`${site.base}/comments/feed`],
    },
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

  it('reads a feed’s posts, and is told when nothing has changed since', async () => {
    const first = await fetcher.readItems(`${site.base}/feed.xml`)
    if (first.status !== 'modified') throw new Error('expected posts')
    expect(first.items).toEqual([
      expect.objectContaining({ id: 'post-1', title: 'First', url: 'https://slow.example/first' }),
    ])
    expect(first.validators).toEqual({
      etag: '"v1"',
      lastModified: 'Fri, 09 Oct 2026 10:00:00 GMT',
    })
    expect(
      await fetcher.readItems(`${site.base}/feed.xml`, { validators: first.validators }),
    ).toEqual({
      status: 'not-modified',
    })
    expect(site.requests.filter((r) => r === '304')).toHaveLength(1)
  })

  it('discovers the feeds a page offers, as the page names them, comments last, without duplicates', async () => {
    expect(await fetcher.discover(`${site.base}/multi`)).toEqual([
      { url: `${site.base}/feed.xml`, title: 'Notes & essays', comments: false },
      { url: `${site.base}/atom.xml`, title: 'Podcast', comments: false },
      { url: `${site.base}/comments/feed`, title: 'Comments on Notes', comments: true },
    ])
  })

  it('discovers a feed address as that one feed, a page with one feed as that one, and caps long lists', async () => {
    expect(await fetcher.discover(`${site.base}/feed.xml`)).toEqual([
      { url: `${site.base}/feed.xml`, title: 'The Slow Reader', comments: false },
    ])
    expect((await fetcher.discover(`${site.base}/site`)).map((c) => c.url)).toEqual([
      `${site.base}/feed.xml`,
    ])
    expect(await fetcher.discover(`${site.base}/many`)).toHaveLength(10)
  })

  it('discovery refuses private addresses and pages without feeds, like reading does', async () => {
    await expect(fetcher.discover(`${site.base}/plain`)).rejects.toMatchObject({
      reason: 'not-a-feed',
    })
    const strict = new HttpFeedFetcher()
    await expect(strict.discover('http://127.0.0.1/multi')).rejects.toMatchObject({
      reason: 'blocked',
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

  it('prefers the website’s icon to the logo the feed names, which is usually too wide to read as an icon', async () => {
    const feed = await fetcher.inspect(`${site.base}/feed-with-logo`)
    expect(feed.iconUrl).toBe(`${site.base}/logo.png`)
    site.requests.length = 0
    const icon = await fetcher.fetchIcon(feed)
    expect(icon?.contentType).toBe('image/png')
    expect(site.requests).toContain('/site-icon.png')
    expect(site.requests).not.toContain('/logo.png')
  })

  it('uses the logo the feed names when the website has no usable icon', async () => {
    const feed = await fetcher.inspect(`${site.base}/feed-logo-site-without-icon`)
    site.requests.length = 0
    expect((await fetcher.fetchIcon(feed))?.contentType).toBe('image/png')
    expect(site.requests).toContain('/logo.png')
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

import { describe, expect, it } from 'vitest'
import { FEED_GUIDES, FEED_RECIPES, findRecipe, WebAddressSchema } from './index'

const build = (id: string, values: Record<string, string>) => findRecipe(id)!.build(values)

describe('feed recipes', () => {
  it.each([
    [
      'guardian',
      { path: 'technology/artificialintelligenceai' },
      'https://www.theguardian.com/technology/artificialintelligenceai/rss',
    ],
    [
      'guardian',
      { path: 'https://www.theguardian.com/world/' },
      'https://www.theguardian.com/world/rss',
    ],
    ['guardian', { path: '/world/rss' }, 'https://www.theguardian.com/world/rss'],
    ['bbc', { section: '' }, 'https://feeds.bbci.co.uk/news/rss.xml'],
    ['bbc', { section: 'technology' }, 'https://feeds.bbci.co.uk/news/technology/rss.xml'],
    [
      'nyt',
      { section: 'Technology' },
      'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml',
    ],
    [
      'google-news',
      { q: '"open data" OR transparency', site: 'https://www.reuters.com/world', edition: 'GB' },
      'https://news.google.com/rss/search?q=%22open%20data%22%20OR%20transparency%20site%3Awww.reuters.com&hl=en-GB&gl=GB&ceid=GB:en',
    ],
    [
      'google-news',
      { q: 'ai', edition: 'US' },
      'https://news.google.com/rss/search?q=ai&hl=en-US&gl=US&ceid=US:en',
    ],
    ['arxiv', { categories: 'cs.CL, q-bio.NC' }, 'https://rss.arxiv.org/rss/cs.CL+q-bio.NC'],
    [
      'biorxiv',
      { server: 'medrxiv', subject: 'Health Policy' },
      'https://connect.medrxiv.org/medrxiv_xml.php?subject=health_policy',
    ],
    [
      'nature',
      { kind: 'subject', name: 'machine-learning' },
      'https://www.nature.com/subjects/machine-learning.rss',
    ],
    ['nature', { kind: 'journal', name: 'nathumbehav' }, 'https://www.nature.com/nathumbehav.rss'],
    [
      'science',
      { journal: 'sciadv' },
      'https://www.science.org/action/showFeed?type=etoc&feed=rss&jc=sciadv',
    ],
    ['substack', { publication: 'OneUsefulThing' }, 'https://oneusefulthing.substack.com/feed'],
    ['substack', { publication: 'https://www.example.org/posts' }, 'https://www.example.org/feed'],
    ['medium', { kind: 'tag', name: 'Data-Science' }, 'https://medium.com/feed/tag/data-science'],
    ['medium', { kind: 'user', name: '@someone' }, 'https://medium.com/feed/@someone'],
    [
      'wordpress',
      { site: 'wordpress.org/news/', kind: 'search', term: 'open data' },
      'https://wordpress.org/news/?s=open%20data&feed=rss2',
    ],
    [
      'wordpress',
      { site: 'example.com', kind: 'category', term: 'Big Ideas' },
      'https://example.com/category/big-ideas/feed',
    ],
    ['ghost', { site: 'blog.example.com', tag: '' }, 'https://blog.example.com/rss/'],
    [
      'ghost',
      { site: 'blog.example.com', tag: 'Book Notes' },
      'https://blog.example.com/tag/book-notes/rss/',
    ],
    [
      'bluesky',
      { handle: '@Someone.bsky.social' },
      'https://bsky.app/profile/someone.bsky.social/rss',
    ],
    [
      'hacker-news',
      { q: 'open data & more' },
      'https://hnrss.org/newest?q=open%20data%20%26%20more',
    ],
    [
      'reddit',
      { kind: 'subreddit', name: 'r/datascience' },
      'https://www.reddit.com/r/datascience/.rss',
    ],
    [
      'reddit',
      { kind: 'search', name: 'open data' },
      'https://www.reddit.com/search.rss?q=open%20data&sort=new',
    ],
  ])('%s builds the address from %j', (id, values, expected) => {
    expect(build(id, values)).toEqual({ ok: true, url: expected })
  })

  it.each([
    ['guardian', { path: '' }],
    ['guardian', { path: 'https://example.com/world' }],
    ['guardian', { path: '../etc/passwd' }],
    ['bbc', { section: 'nonsense' }],
    ['nyt', { section: '../x' }],
    ['google-news', { q: '' }],
    ['google-news', { q: 'ai', site: 'not a site' }],
    ['arxiv', { categories: '' }],
    ['arxiv', { categories: 'cs.CL/../x' }],
    ['biorxiv', { server: 'evil', subject: 'x' }],
    ['biorxiv', { server: 'biorxiv', subject: 'a&b=1' }],
    ['nature', { kind: 'journal', name: 'a/b' }],
    ['science', { journal: 'x' }],
    ['substack', { publication: '' }],
    ['substack', { publication: 'a b c' }],
    ['medium', { kind: 'tag', name: '' }],
    ['wordpress', { site: 'nonsense', kind: 'search', term: 'x' }],
    ['wordpress', { site: 'example.com', kind: 'search', term: '  ' }],
    ['ghost', { site: 'example.com', tag: '../x' }],
    ['bluesky', { handle: 'nodot' }],
    ['hacker-news', { q: '   ' }],
    ['reddit', { kind: 'subreddit', name: 'a b' }],
  ])('%s refuses %j, in words', (id, values) => {
    const result = build(id, values)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toMatch(/\w+ \w+/)
  })

  it('only ever builds addresses that the feed fetcher would accept as web addresses', () => {
    for (const recipe of FEED_RECIPES) {
      const values: Record<string, string> = {}
      for (const f of recipe.fields) {
        values[f.id] = f.kind === 'select' ? f.options[0]!.value : (f.placeholder ?? 'example.com')
      }
      const result = recipe.build(values)
      if (result.ok) expect(WebAddressSchema.safeParse(result.url).success, recipe.id).toBe(true)
    }
  })

  it('has unique ids, a group, a summary, and no select without options', () => {
    const ids = [...FEED_RECIPES.map((r) => r.id), ...FEED_GUIDES.map((g) => g.id)]
    expect(new Set(ids).size).toBe(ids.length)
    for (const r of FEED_RECIPES) {
      expect(r.summary, r.id).toBeTruthy()
      for (const f of r.fields) if (f.kind === 'select') expect(f.options.length).toBeGreaterThan(0)
    }
    for (const g of FEED_GUIDES) expect(g.steps.length, g.id).toBeGreaterThan(0)
  })
})

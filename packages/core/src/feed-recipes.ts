/**
 * "Find a feed": ways to build the address of a feed from a service and a topic, for people who
 * don't know that (say) the Guardian's AI page has a feed. Pure functions, no network: the address
 * we build is read by the feed fetcher before it can be added, so a recipe that has stopped working
 * says so then. See docs/research/idea-source-feeds.md for where each pattern comes from.
 */

export type RecipeGroup = 'news' | 'academic' | 'platforms'

export const RECIPE_GROUP_LABELS: Record<RecipeGroup, string> = {
  news: 'News',
  academic: 'Research and journals',
  platforms: 'Blogs, newsletters and communities',
}

interface FieldBase {
  id: string
  label: string
  hint?: string
}
export type RecipeField =
  | (FieldBase & { kind: 'text'; placeholder?: string })
  | (FieldBase & { kind: 'select'; options: { value: string; label: string }[] })

export type RecipeValues = Record<string, string>

export type RecipeResult = { ok: true; url: string } | { ok: false; message: string }

export interface FeedRecipe {
  id: string
  group: RecipeGroup
  name: string
  /** One line: what you get. */
  summary: string
  fields: RecipeField[]
  /** What to know before relying on it (broad, rate limited, links via another site...). */
  caveat?: string
  /** True for sources that publish everything, where most items will not matter to a given writer. */
  broad?: boolean
  build(values: RecipeValues): RecipeResult
}

/** Sources with no feed to build, where the best help is saying how to get one. */
export interface FeedGuide {
  id: string
  name: string
  summary: string
  steps: string[]
}

const ok = (url: string): RecipeResult => ({ ok: true, url })
const fail = (message: string): RecipeResult => ({ ok: false, message })

const clean = (v: string | undefined) => (v ?? '').trim()

/** The last thing in a pasted address or "@name": people paste whichever they have. */
function slug(value: string, pattern = /^[a-z0-9][a-z0-9._-]*$/i): string | null {
  const v = clean(value).replace(/^@/, '')
  return pattern.test(v) ? v : null
}

/** A host name, from "example.com", "https://example.com/blog" and so on. */
function hostOf(value: string): string | null {
  const v = clean(value)
  if (!v) return null
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`)
    if (!/^https?:$/.test(url.protocol) || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(url.hostname)) {
      return null
    }
    return url.hostname.toLowerCase()
  } catch {
    return null
  }
}

/** A path like "technology/artificialintelligenceai", from the path or a full address on `host`. */
function pathOn(value: string, host: RegExp): string | null {
  let v = clean(value)
  if (/^[a-z][a-z0-9+.-]*:|^[a-z0-9.-]+\.[a-z]{2,}\//i.test(v)) {
    try {
      const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`)
      if (!host.test(url.hostname)) return null
      v = url.pathname
    } catch {
      return null
    }
  }
  v = v.replace(/^\/+|\/+$/g, '').replace(/\/rss$/i, '')
  return /^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)*$/i.test(v) ? v : null
}

/** Words to search for. Short, because every service has its own limits and these are topics. */
function searchTerms(value: string): string | null {
  const v = clean(value).replace(/\s+/g, ' ')
  return v && v.length <= 200 ? v : null
}

const MISSING = (what: string) => `Add ${what} first.`

const select = (id: string, label: string, options: [string, string][], hint?: string) =>
  ({
    kind: 'select',
    id,
    label,
    hint,
    options: options.map(([value, label]) => ({ value, label })),
  }) satisfies RecipeField

const text = (id: string, label: string, hint?: string, placeholder?: string) =>
  ({ kind: 'text', id, label, hint, placeholder }) satisfies RecipeField

const BBC_SECTIONS: [string, string][] = [
  ['', 'Top stories'],
  ['world', 'World'],
  ['uk', 'UK'],
  ['business', 'Business'],
  ['politics', 'Politics'],
  ['health', 'Health'],
  ['education', 'Education'],
  ['science_and_environment', 'Science and environment'],
  ['technology', 'Technology'],
  ['entertainment_and_arts', 'Entertainment and arts'],
]

const NYT_SECTIONS: [string, string][] = [
  ['HomePage', 'Home page'],
  ['World', 'World'],
  ['US', 'U.S.'],
  ['Politics', 'Politics'],
  ['Business', 'Business'],
  ['Technology', 'Technology'],
  ['Science', 'Science'],
  ['Climate', 'Climate'],
  ['Health', 'Health'],
  ['Education', 'Education'],
  ['Opinion', 'Opinion'],
  ['Arts', 'Arts'],
]

const SCIENCE_JOURNALS: [string, string][] = [
  ['science', 'Science'],
  ['sciadv', 'Science Advances'],
  ['scitranslmed', 'Science Translational Medicine'],
  ['scirobotics', 'Science Robotics'],
  ['sciimmunol', 'Science Immunology'],
  ['signaling', 'Science Signaling'],
]

const oneOf = (value: string, options: [string, string][]) => options.some(([v]) => v === value)

export const FEED_RECIPES: FeedRecipe[] = [
  {
    id: 'guardian',
    group: 'news',
    name: 'The Guardian',
    summary: 'The newest articles in a section, topic or by a writer.',
    fields: [
      text(
        'path',
        'Section, topic or writer',
        'The end of its address on theguardian.com, or paste the whole address. For example technology/artificialintelligenceai.',
        'technology/artificialintelligenceai',
      ),
    ],
    build({ path }) {
      const p = pathOn(path ?? '', /(^|\.)theguardian\.com$/i)
      return p
        ? ok(`https://www.theguardian.com/${p}/rss`)
        : fail(
            'Give a section, topic or writer from theguardian.com, like world or technology/artificialintelligenceai.',
          )
    },
  },
  {
    id: 'bbc',
    group: 'news',
    name: 'BBC News',
    summary: 'The BBC News stories in one section.',
    fields: [select('section', 'Section', BBC_SECTIONS)],
    build({ section = '' }) {
      if (!oneOf(section, BBC_SECTIONS)) return fail('Choose one of the sections.')
      return ok(
        section
          ? `https://feeds.bbci.co.uk/news/${section}/rss.xml`
          : 'https://feeds.bbci.co.uk/news/rss.xml',
      )
    },
  },
  {
    id: 'nyt',
    group: 'news',
    name: 'The New York Times',
    summary: 'Headlines and summaries for one section.',
    fields: [select('section', 'Section', NYT_SECTIONS)],
    build({ section = '' }) {
      return oneOf(section, NYT_SECTIONS)
        ? ok(`https://rss.nytimes.com/services/xml/rss/nyt/${section}.xml`)
        : fail('Choose one of the sections.')
    },
  },
  {
    id: 'google-news',
    group: 'news',
    name: 'Google News search',
    summary: 'News stories matching words you choose, from many outlets.',
    fields: [
      text(
        'q',
        'Search for',
        'Words or a "quoted phrase". OR also works, for example "open data" OR "data sharing".',
      ),
      text(
        'site',
        'Only from one site (optional)',
        'Useful for outlets with no feed of their own, for example reuters.com.',
      ),
      select('edition', 'Edition', [
        ['GB', 'UK'],
        ['US', 'US'],
      ]),
    ],
    caveat:
      'Google doesn’t document this, it may change, and links go through Google rather than straight to the article.',
    build({ q, site, edition = 'GB' }) {
      const terms = searchTerms(q ?? '')
      if (!terms) return fail(MISSING('some words to search for'))
      let query = terms
      if (clean(site)) {
        const host = hostOf(site ?? '')
        if (!host) return fail('Give a site address like reuters.com, or leave that box empty.')
        query = `${terms} site:${host}`
      }
      if (edition !== 'GB' && edition !== 'US') return fail('Choose an edition.')
      const lang = edition === 'GB' ? 'en-GB' : 'en-US'
      return ok(
        `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${lang}&gl=${edition}&ceid=${edition}:en`,
      )
    },
  },
  {
    id: 'arxiv',
    group: 'academic',
    name: 'arXiv',
    summary: 'New preprints in one or more subject areas, with abstracts.',
    fields: [
      text(
        'categories',
        'Subject area codes',
        'Separate several with commas, for example cs.CL, cs.AI. The codes are listed at arxiv.org.',
        'cs.CL',
      ),
    ],
    broad: true,
    caveat:
      'Updated once a day and empty at weekends. A whole archive such as cs is hundreds of papers a day, so choose narrow areas.',
    build({ categories }) {
      const codes = clean(categories)
        .split(/[\s,+]+/)
        .filter(Boolean)
      if (!codes.length) return fail(MISSING('a subject area code, like cs.CL'))
      if (codes.length > 10) return fail('Choose 10 areas or fewer.')
      if (!codes.every((c) => /^[a-z]+(-[a-z]+)*(\.[A-Za-z-]+)?$/.test(c))) {
        return fail('Subject area codes look like cs.CL or q-bio.NC.')
      }
      return ok(`https://rss.arxiv.org/rss/${codes.join('+')}`)
    },
  },
  {
    id: 'biorxiv',
    group: 'academic',
    name: 'bioRxiv and medRxiv',
    summary: 'The newest preprints in a subject, with abstracts.',
    fields: [
      select('server', 'Server', [
        ['biorxiv', 'bioRxiv (biology)'],
        ['medrxiv', 'medRxiv (medicine)'],
      ]),
      text('subject', 'Subject', 'For example neuroscience or epidemiology.'),
    ],
    build({ server = 'biorxiv', subject }) {
      if (server !== 'biorxiv' && server !== 'medrxiv') return fail('Choose bioRxiv or medRxiv.')
      const s = clean(subject)
        .toLowerCase()
        .replace(/[\s-]+/g, '_')
      if (!s) return fail(MISSING('a subject'))
      if (!/^[a-z_]+$/.test(s)) return fail('A subject is made of words, like neuroscience.')
      return ok(`https://connect.${server}.org/${server}_xml.php?subject=${s}`)
    },
  },
  {
    id: 'nature',
    group: 'academic',
    name: 'Nature',
    summary: 'New articles in a subject, or in one of the Nature journals.',
    fields: [
      select('kind', 'Follow a', [
        ['subject', 'Subject'],
        ['journal', 'Journal'],
      ]),
      text(
        'name',
        'Name',
        'The end of its address on nature.com, for example machine-learning (a subject) or nature or nathumbehav (a journal).',
      ),
    ],
    build({ kind = 'subject', name }) {
      const n = slug(name ?? '', /^[a-z0-9][a-z0-9-]*$/i)
      if (!n) return fail('Give a subject like machine-learning, or a journal like nature.')
      if (kind === 'journal') return ok(`https://www.nature.com/${n}.rss`)
      if (kind === 'subject') return ok(`https://www.nature.com/subjects/${n}.rss`)
      return fail('Choose subject or journal.')
    },
  },
  {
    id: 'science',
    group: 'academic',
    name: 'Science journals',
    summary: 'The contents of each new issue of a journal from AAAS.',
    fields: [select('journal', 'Journal', SCIENCE_JOURNALS)],
    build({ journal = '' }) {
      return oneOf(journal, SCIENCE_JOURNALS)
        ? ok(`https://www.science.org/action/showFeed?type=etoc&feed=rss&jc=${journal}`)
        : fail('Choose one of the journals.')
    },
  },
  {
    id: 'substack',
    group: 'platforms',
    name: 'Substack',
    summary: 'A newsletter’s posts.',
    fields: [
      text(
        'publication',
        'Publication',
        'Its Substack name (the part before .substack.com), or its own web address.',
        'oneusefulthing',
      ),
    ],
    caveat: 'Paid posts show only a preview, and a writer can switch the feed off.',
    build({ publication }) {
      const p = clean(publication)
      if (!p) return fail(MISSING('the publication’s name'))
      if (/^[a-z0-9-]+$/i.test(p)) return ok(`https://${p.toLowerCase()}.substack.com/feed`)
      const host = hostOf(p)
      return host
        ? ok(`https://${host}/feed`)
        : fail('Give a name like oneusefulthing, or an address like example.com.')
    },
  },
  {
    id: 'medium',
    group: 'platforms',
    name: 'Medium',
    summary: 'Posts on a tag, from a writer, or in a publication.',
    fields: [
      select('kind', 'Follow a', [
        ['tag', 'Tag'],
        ['user', 'Writer'],
        ['publication', 'Publication'],
      ]),
      text('name', 'Name', 'For example data-science, or a writer’s @name.'),
    ],
    caveat:
      'Only the latest ten stories. Tag feeds have no text, only titles, and paywalled stories aren’t included in full.',
    build({ kind = 'tag', name }) {
      const n = slug(name ?? '', /^[a-z0-9][a-z0-9._-]*$/i)
      if (!n) return fail(MISSING('a name'))
      if (kind === 'tag') return ok(`https://medium.com/feed/tag/${n.toLowerCase()}`)
      if (kind === 'user') return ok(`https://medium.com/feed/@${n}`)
      if (kind === 'publication') return ok(`https://medium.com/feed/${n}`)
      return fail('Choose tag, writer or publication.')
    },
  },
  {
    id: 'wordpress',
    group: 'platforms',
    name: 'A WordPress site',
    summary: 'Posts on any WordPress site matching a search, or in one category.',
    fields: [
      text('site', 'Site address', 'For example wordpress.org/news.'),
      select('kind', 'Follow', [
        ['search', 'A search'],
        ['category', 'A category'],
      ]),
      text('term', 'Search words, or category name'),
    ],
    caveat: 'A site’s owner can switch its feeds off.',
    build({ site, kind = 'search', term }) {
      const host = hostOf(site ?? '')
      if (!host) return fail('Give the site’s address, like example.com.')
      // A blog can live under a path (example.com/news); keep it.
      const base = (() => {
        const v = clean(site)
        try {
          const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`)
          return `https://${u.hostname.toLowerCase()}${u.pathname.replace(/\/+$/, '')}`
        } catch {
          return `https://${host}`
        }
      })()
      const t = clean(term)
      if (!t) return fail(MISSING('a search or category'))
      if (kind === 'search') return ok(`${base}/?s=${encodeURIComponent(t)}&feed=rss2`)
      if (kind === 'category') {
        const s = t.toLowerCase().replace(/\s+/g, '-')
        return /^[a-z0-9][a-z0-9_-]*$/.test(s)
          ? ok(`${base}/category/${s}/feed`)
          : fail('A category is a word or words, like releases.')
      }
      return fail('Choose search or category.')
    },
  },
  {
    id: 'ghost',
    group: 'platforms',
    name: 'A Ghost site',
    summary: 'Posts with one tag on a site built with Ghost.',
    fields: [
      text('site', 'Site address', 'For example blog.example.com.'),
      text('tag', 'Tag', 'Leave empty for every post.'),
    ],
    build({ site, tag }) {
      const host = hostOf(site ?? '')
      if (!host) return fail('Give the site’s address, like blog.example.com.')
      const t = clean(tag).toLowerCase().replace(/\s+/g, '-')
      if (!t) return ok(`https://${host}/rss/`)
      return /^[a-z0-9][a-z0-9_-]*$/.test(t)
        ? ok(`https://${host}/tag/${t}/rss/`)
        : fail('A tag is a word or words, like news.')
    },
  },
  {
    id: 'bluesky',
    group: 'platforms',
    name: 'Bluesky',
    summary: 'One person’s posts.',
    fields: [text('handle', 'Handle', 'For example someone.bsky.social.')],
    caveat: 'Per person only: Bluesky has no feeds for keywords or hashtags.',
    build({ handle }) {
      const h = slug(handle ?? '', /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9-]+)+$/i)
      return h
        ? ok(`https://bsky.app/profile/${h.toLowerCase()}/rss`)
        : fail('A handle looks like someone.bsky.social.')
    },
  },
  {
    id: 'hacker-news',
    group: 'platforms',
    name: 'Hacker News search',
    summary: 'New Hacker News stories and discussions matching words you choose.',
    fields: [text('q', 'Search for')],
    caveat: 'Run by a volunteer (hnrss.org), not by Hacker News.',
    build({ q }) {
      const terms = searchTerms(q ?? '')
      return terms
        ? ok(`https://hnrss.org/newest?q=${encodeURIComponent(terms)}`)
        : fail(MISSING('some words to search for'))
    },
  },
  {
    id: 'reddit',
    group: 'platforms',
    name: 'Reddit',
    summary: 'New posts in a subreddit, or matching a search.',
    fields: [
      select('kind', 'Follow', [
        ['subreddit', 'A subreddit'],
        ['search', 'A search'],
      ]),
      text('name', 'Subreddit name, or search words'),
    ],
    caveat: 'Reddit often refuses automated readers, so this may fail or stop working.',
    build({ kind = 'subreddit', name }) {
      if (kind === 'search') {
        const terms = searchTerms(name ?? '')
        return terms
          ? ok(`https://www.reddit.com/search.rss?q=${encodeURIComponent(terms)}&sort=new`)
          : fail(MISSING('some words to search for'))
      }
      if (kind !== 'subreddit') return fail('Choose subreddit or search.')
      const s = clean(name).replace(/^\/?r\//i, '')
      return /^[a-z0-9_]{2,21}$/i.test(s)
        ? ok(`https://www.reddit.com/r/${s}/.rss`)
        : fail('A subreddit name is letters, numbers and underscores, like datascience.')
    },
  },
]

export const FEED_GUIDES: FeedGuide[] = [
  {
    id: 'pubmed',
    name: 'PubMed',
    summary: 'Any PubMed search can become a feed, but PubMed has to make the address.',
    steps: [
      'Search on pubmed.ncbi.nlm.nih.gov and check that the results are the ones you want.',
      'Under the search box choose “Create RSS”, then “Create RSS” again. You may need a free NCBI account.',
      'Copy the address it shows and paste it into “Add a feed” above.',
    ],
  },
  {
    id: 'scholar',
    name: 'Google Scholar and Semantic Scholar',
    summary: 'These send alerts by email only. They don’t offer feeds.',
    steps: [
      'Look for the same papers on arXiv, bioRxiv or Nature above, which do have feeds.',
      'Or find the journal’s own feed: the journal’s website usually has an RSS link.',
    ],
  },
]

export const findRecipe = (id: string) => FEED_RECIPES.find((r) => r.id === id)

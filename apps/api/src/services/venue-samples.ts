import {
  FeedError,
  MAX_VENUE_POSTS,
  MAX_VENUE_SAMPLES,
  type FeedFetcher,
  type PageTextFetcher,
  type PageTextProblem,
  type VenuePosts,
  type VenueSample,
} from '@lfwa/core'

/** Reading a site's feed or a few pages can take a while; longer than this and the person is better told. */
const TIMEOUT_MS = 20_000

const PASTE_INSTEAD = 'Paste links to a few of its posts instead.'

const PROBLEMS: Record<PageTextProblem, string> = {
  'not-found': 'That site doesn’t seem to exist. Check the address, or paste a different link.',
  'not-public':
    'That address isn’t a public web page, so we can’t read it. Paste a different link.',
  unreadable: 'We couldn’t read that page. Paste a different link, or leave this one out.',
}

/**
 * Finds and reads the sample posts a venue's description can be drafted from. Both steps are chores, not writing:
 * no AI is involved, and nothing is stored, so a post's text exists only in the answer to the request that read it.
 */
export class VenueSampleService {
  constructor(
    private readonly feeds: FeedFetcher,
    private readonly pages: PageTextFetcher,
  ) {}

  /** The newest posts of the feed that `siteUrl` offers, or a sentence saying why there are none. */
  async recentPosts(siteUrl: string): Promise<VenuePosts> {
    const signal = AbortSignal.timeout(TIMEOUT_MS)
    try {
      const [feed] = await this.feeds.discover(siteUrl, { signal }) // feeds of comments come last
      const result = await this.feeds.readItems(feed!.url, { signal })
      if (result.status !== 'modified') return { posts: [], notice: null } // no validators were sent
      const posts = result.items.filter((item) => item.url).slice(0, MAX_VENUE_POSTS)
      return posts.length
        ? { posts, notice: null }
        : { posts: [], notice: `That site’s feed has no posts yet. ${PASTE_INSTEAD}` }
    } catch (err) {
      if (!(err instanceof FeedError)) throw err
      const notice =
        err.reason === 'not-a-feed'
          ? `We couldn’t find a feed on that site. ${PASTE_INSTEAD}`
          : `${err.message} ${PASTE_INSTEAD}`
      return { posts: [], notice }
    }
  }

  /** Reads each address, at most `MAX_VENUE_SAMPLES`, answering one result per address, in the order given. */
  async read(urls: string[]): Promise<VenueSample[]> {
    const unique = [...new Set(urls)].slice(0, MAX_VENUE_SAMPLES)
    const signal = AbortSignal.timeout(TIMEOUT_MS)
    return Promise.all(
      unique.map(async (url): Promise<VenueSample> => {
        const page = await this.pages.fetchText(url, signal)
        return page.ok
          ? { ok: true, url, title: page.title, text: page.text, truncated: page.truncated }
          : { ok: false, url, message: PROBLEMS[page.problem] }
      }),
    )
  }
}

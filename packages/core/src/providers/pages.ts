export interface PageInfo {
  /** The page's own title, or null when there isn't one or it couldn't be read. */
  title: string | null
  /**
   * Set when the address itself is the problem, as opposed to a page that merely couldn't be read:
   * `not-found` means the site's name doesn't exist; `not-public` means it points somewhere on a
   * private network, which we never contact.
   */
  problem?: 'not-found' | 'not-public'
}

/**
 * Port for looking at a web page on a person's behalf (today: just its title). Fetching a
 * person-supplied address from the server is a security-sensitive job, so adapters must only ever
 * reach public sites, and must resolve rather than reject: any failure is `{ title: null }`.
 */
export interface PageInfoFetcher {
  fetchInfo(url: string, signal?: AbortSignal): Promise<PageInfo>
}

/** Never contacts anything; used where titles aren't wanted. */
export class NoPageInfoFetcher implements PageInfoFetcher {
  async fetchInfo(): Promise<PageInfo> {
    return { title: null }
  }
}

/**
 * Deterministic stand-in for tests, development and e2e runs. By default a page is titled
 * "Fake title for <host>", unless the address contains `untitled` (no title) or `nonexistent`
 * (the site doesn't exist), or `private` (not public). Pass `pages` to say exactly what to return.
 */
export class FakePageInfoFetcher implements PageInfoFetcher {
  readonly calls: string[] = []

  constructor(private readonly pages: Record<string, PageInfo> = {}) {}

  async fetchInfo(url: string, signal?: AbortSignal): Promise<PageInfo> {
    this.calls.push(url)
    if (signal?.aborted) return { title: null }
    const known = this.pages[url]
    if (known) return known
    if (url.includes('nonexistent')) return { title: null, problem: 'not-found' }
    if (url.includes('private')) return { title: null, problem: 'not-public' }
    if (url.includes('untitled')) return { title: null }
    return { title: `Fake title for ${new URL(url).hostname}` }
  }
}

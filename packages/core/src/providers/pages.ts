export interface PageInfo {
  /** The page's own title, or null when there isn't one or it couldn't be read. */
  title: string | null
  /** Who the page says wrote it, in the page's order; absent when it names no one. */
  authors?: string[]
  /**
   * Set when the address itself is the problem, as opposed to a page that merely couldn't be read:
   * `not-found` means the site's name doesn't exist; `not-public` means it points somewhere on a
   * private network, which we never contact.
   */
  problem?: 'not-found' | 'not-public'
}

/**
 * Port for looking at a web page on a person's behalf (today: its title and who wrote it). Fetching a
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
 * (the site doesn't exist), or `private` (not public); one containing `authored` names two authors. Pass `pages` to say exactly what to return.
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
    const title = `Fake title for ${new URL(url).hostname}`
    return url.includes('authored') ? { title, authors: ['Ada Author', 'Bo Writer'] } : { title }
  }
}

/** The most text kept from one page, so a handful of sample posts stays small enough to put in a prompt. */
export const PAGE_TEXT_MAX_CHARS = 8000

/** Why a page's text couldn't be read; the message the person sees is chosen where it is shown. */
export type PageTextProblem = 'not-found' | 'not-public' | 'unreadable'

export type PageTextResult =
  | {
      ok: true
      /** The page's own title, or null when it has none. */
      title: string | null
      /** The words of the page's main content as plain text (never HTML), at most `PAGE_TEXT_MAX_CHARS`. */
      text: string
      /** True when there was more than `text` holds. */
      truncated: boolean
    }
  | { ok: false; problem: PageTextProblem }

/**
 * Port for reading what a web page says, on a person's behalf (today: sample posts for describing a venue).
 * Like `PageInfoFetcher` it fetches an address a person supplied, so adapters must only ever reach public
 * sites, and must resolve rather than reject: any failure is `{ ok: false }`. The text is the page's words,
 * to be treated as data and never as instructions.
 */
export interface PageTextFetcher {
  fetchText(url: string, signal?: AbortSignal): Promise<PageTextResult>
}

/** Never contacts anything; used where page text isn't wanted. */
export class NoPageTextFetcher implements PageTextFetcher {
  async fetchText(): Promise<PageTextResult> {
    return { ok: false, problem: 'unreadable' }
  }
}

/**
 * Deterministic stand-in for tests, development and e2e runs. A page is titled "Fake title for <host>" and says
 * a sentence about itself, unless the address contains `untitled` (no title), `nonexistent`, `private` or
 * `unreadable` (the matching problem), or `long` (more than the cap, so truncated). Pass `pages` to say exactly
 * what to return.
 */
export class FakePageTextFetcher implements PageTextFetcher {
  readonly calls: string[] = []

  constructor(private readonly pages: Record<string, PageTextResult> = {}) {}

  async fetchText(url: string, signal?: AbortSignal): Promise<PageTextResult> {
    this.calls.push(url)
    if (signal?.aborted) return { ok: false, problem: 'unreadable' }
    const known = this.pages[url]
    if (known) return known
    if (url.includes('nonexistent')) return { ok: false, problem: 'not-found' }
    if (url.includes('private')) return { ok: false, problem: 'not-public' }
    if (url.includes('unreadable')) return { ok: false, problem: 'unreadable' }
    const host = new URL(url).hostname
    const title = url.includes('untitled') ? null : `Fake title for ${host}`
    if (url.includes('long')) {
      return {
        ok: true,
        title,
        text: 'A long sentence about the venue. '.repeat(400).slice(0, PAGE_TEXT_MAX_CHARS),
        truncated: true,
      }
    }
    return { ok: true, title, text: `This is the text of a post on ${host}.`, truncated: false }
  }
}

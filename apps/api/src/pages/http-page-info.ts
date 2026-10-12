import type { PageInfo, PageInfoFetcher } from '@lfwa/core'
import { extractAuthors } from './authors'
import { SafeReader, type SafeReaderOptions } from './safe-reader'
import { extractTitle } from './title'

export interface HttpPageInfoOptions extends Partial<Omit<SafeReaderOptions, 'maxBytes'>> {
  /** How much of a page to read looking for its title. */
  maxBytes?: number
}

/**
 * Reads a page's title (and who wrote it) over HTTP(S). It reads only as far as the end of the page's head, and
 * every failure is reported as "no title", never thrown. How it stays away from private networks is in
 * `SafeReader`.
 */
export class HttpPageInfoFetcher implements PageInfoFetcher {
  private readonly reader: SafeReader

  constructor(options: HttpPageInfoOptions = {}) {
    this.reader = new SafeReader(
      {
        ...options,
        timeoutMs: options.timeoutMs ?? 5000,
        maxBytes: options.maxBytes ?? 256 * 1024,
      },
      'Wordwright/1.0 (reads page titles for saved links)',
    )
  }

  async fetchInfo(url: string, signal?: AbortSignal): Promise<PageInfo> {
    try {
      // The title and who wrote the page are in the head, so stop once it is complete.
      const result = await this.reader.read(url, signal, (text) => /<\/head\s*>/i.test(text))
      if (!('html' in result)) return { title: null }
      const authors = extractAuthors(result.html)
      return authors.length
        ? { title: extractTitle(result.html), authors }
        : { title: extractTitle(result.html) }
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code === 'ENOTFOUND') return { title: null, problem: 'not-found' }
      if (code === 'ENOTPUBLIC') return { title: null, problem: 'not-public' }
      return { title: null }
    }
  }
}

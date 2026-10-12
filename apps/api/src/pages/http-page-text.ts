import { PAGE_TEXT_MAX_CHARS, type PageTextFetcher, type PageTextResult } from '@lfwa/core'
import { extractReadableText } from './readable-text'
import { SafeReader, type SafeReaderOptions } from './safe-reader'
import { extractTitle } from './title'

export interface HttpPageTextOptions extends Partial<SafeReaderOptions> {
  /** The most characters of text to keep. */
  maxChars?: number
}

/**
 * Reads the words of a web page over HTTP(S): its title and main text. Pages are bigger than their heads, so it
 * reads up to 1 MB. Every failure is reported as a problem, never thrown. How it stays away from private networks
 * is in `SafeReader`.
 */
export class HttpPageTextFetcher implements PageTextFetcher {
  private readonly reader: SafeReader
  private readonly maxChars: number

  constructor(options: HttpPageTextOptions = {}) {
    this.maxChars = options.maxChars ?? PAGE_TEXT_MAX_CHARS
    this.reader = new SafeReader(
      {
        ...options,
        timeoutMs: options.timeoutMs ?? 8000,
        maxBytes: options.maxBytes ?? 1024 * 1024,
      },
      'Wordwright/1.0 (reads sample posts to describe a venue)',
    )
  }

  async fetchText(url: string, signal?: AbortSignal): Promise<PageTextResult> {
    try {
      const result = await this.reader.read(url, signal)
      if (!('html' in result)) return { ok: false, problem: 'unreadable' }
      const { text, truncated } = extractReadableText(result.html, this.maxChars)
      if (!text) return { ok: false, problem: 'unreadable' } // a page with no words (a script-built page, say)
      return { ok: true, title: extractTitle(result.html), text, truncated }
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code === 'ENOTFOUND') return { ok: false, problem: 'not-found' }
      if (code === 'ENOTPUBLIC') return { ok: false, problem: 'not-public' }
      return { ok: false, problem: 'unreadable' }
    }
  }
}

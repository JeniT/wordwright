import {
  linkKey,
  SuggestReadingToolInputSchema,
  type Idea,
  type PageInfoFetcher,
  type ReadingCheck,
} from '@lfwa/core'

/** A suggested reading-list item once its address has been looked at. */
export interface CheckedReading {
  /** What the caller called the candidate it came from (for example the id of the tool call). */
  ref: string
  /** The address, tidied (a scheme added if it had none). */
  url: string
  /** The title the AI gave; it may be wrong, which is why the real one is fetched. */
  title: string
  /** The AI's reason. Its claim, unverified. */
  why: string
  check: ReadingCheck
  /** The title the page really has, if the server could read one. */
  fetchedTitle: string | null
  /** Who the page says wrote it. */
  fetchedAuthors: string[]
}

/** The shape of a suggestion before it is trusted: from a model's tool call or a search adapter. */
export interface ReadingCandidate {
  ref: string
  url: unknown
  title: unknown
  why: unknown
}

/**
 * Turns what an AI suggested for the reading list into suggestions fit to show a person. Everything is
 * untrusted: an item must have a plausible web address, a reason, and not already be on the list (or repeat
 * another in the same batch). Then each address is looked at by the SSRF-safe page fetcher, so that the
 * writer is shown whether it resolves and what the page is really called, and failures are flagged before
 * they can be accepted. Nothing here adds anything to an idea.
 */
export class ReadingChecker {
  constructor(private readonly pages: PageInfoFetcher) {}

  /** At most `max` suggestions survive, in the order given. */
  async check(
    idea: Idea,
    candidates: ReadingCandidate[],
    max: number,
    signal?: AbortSignal,
  ): Promise<CheckedReading[]> {
    const seen = new Set(idea.links.map((l) => linkKey(l.url)))
    const usable: { ref: string; url: string; title: string; why: string }[] = []
    for (const candidate of candidates) {
      if (usable.length >= max) break
      const parsed = SuggestReadingToolInputSchema.safeParse(clip(candidate))
      if (!parsed.success) continue
      const key = linkKey(parsed.data.url)
      if (seen.has(key)) continue
      seen.add(key)
      usable.push({ ref: candidate.ref, ...parsed.data })
    }
    return Promise.all(usable.map((u) => this.look(u, signal)))
  }

  private async look(
    suggested: { ref: string; url: string; title: string; why: string },
    signal?: AbortSignal,
  ): Promise<CheckedReading> {
    const info = await this.pages.fetchInfo(suggested.url, signal)
    const check: ReadingCheck = info.problem ?? (info.title ? 'found' : 'no-title')
    return {
      ...suggested,
      check,
      fetchedTitle: info.title ?? null,
      fetchedAuthors: info.authors ?? [],
    }
  }
}

/** A title or reason that is a little too long is shortened rather than the whole suggestion lost. */
function clip({ url, title, why }: ReadingCandidate) {
  const cut = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : v)
  return { url, title: cut(title, 200), why: cut(why, 300) }
}

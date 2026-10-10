import { HTTPException } from 'hono/http-exception'
import {
  linkKey,
  LLMAuthError,
  LLMProviderError,
  LLMRateLimitError,
  MAX_IDEA_LINKS,
  MAX_RESEARCH_RESULTS,
  type Idea,
  type PageInfoFetcher,
  type ResearchInput,
  type ResearchProvider,
  type ResearchRun,
} from '@lfwa/core'
import { RESEARCH_PROMPT } from '@lfwa/prompts'
import type { RateLimiter } from '../auth/rate-limit'
import type { Store } from '../db/store'
import { ReadingChecker } from './reading-suggestions'

/** A search that takes longer than this is abandoned. */
export const RESEARCH_TIMEOUT_MS = 180_000

const fail = (status: 400 | 404 | 409 | 429 | 502 | 504, message: string) =>
  new HTTPException(status, { message })

/** Keeps text we insert from closing or imitating the brief's own tags. */
const escape = (text: string) => text.replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * What the researcher is given: what the writer wants to look into (the main thing), the idea's title and notes for
 * context, and the addresses already on the reading list. All of it is the writer's own words, so it is escaped,
 * and `prompts/research.md` tells the researcher to treat it as material. Never the text of a draft.
 */
export function formatResearchBrief(idea: Idea, areas: string): string {
  return [
    '<areas_to_research>',
    escape(areas),
    '</areas_to_research>',
    '<idea>',
    `Idea title: ${escape(idea.name)}`,
    'Notes:',
    idea.notes.trim() ? escape(idea.notes) : '(none yet)',
    '</idea>',
    '<already_on_the_reading_list>',
    ...(idea.links.length ? idea.links.map((l) => `- ${escape(l.url)}`) : ['(nothing yet)']),
    '</already_on_the_reading_list>',
  ].join('\n')
}

export interface ResearchDeps {
  store: Store
  /** The person's own web-searching researcher. Throws `LlmError` if they have no key. */
  resolveResearch: (userId: string) => {
    research: ResearchProvider
    provider: string
    model: string
  }
  /** Looks at the addresses found (the SSRF-safe fetcher). */
  pages: PageInfoFetcher
  /** Per person: each run spends their money and makes the server look at several sites. */
  limiter: RateLimiter
  timeoutMs?: number
}

/**
 * Research is kept apart from brainstorming: the writer describes the areas to look into, one request goes to their
 * own researcher, and what it finds is saved as a list to review. Nothing joins the reading list until a person
 * adds it. Design: docs/decisions.md (T38).
 */
export class ResearchService {
  private readonly checker: ReadingChecker

  constructor(private readonly d: ResearchDeps) {
    this.checker = new ReadingChecker(d.pages)
  }

  list(idea: Idea): ResearchRun[] {
    return this.d.store.research.list(idea.id)
  }

  async run(
    idea: Idea,
    user: { id: string },
    input: ResearchInput,
    signal?: AbortSignal,
  ): Promise<ResearchRun> {
    const { store, limiter } = this.d
    if (!limiter.allow(user.id)) {
      throw fail(429, "You're searching very quickly. Wait a few minutes and try again.")
    }
    const { research, provider, model } = this.d.resolveResearch(user.id)

    const deadline = AbortSignal.timeout(this.d.timeoutMs ?? RESEARCH_TIMEOUT_MS)
    const stop = signal ? AbortSignal.any([signal, deadline]) : deadline
    let found
    try {
      found = await research.find({
        system: RESEARCH_PROMPT,
        brief: formatResearchBrief(idea, input.areas),
        maxResults: MAX_RESEARCH_RESULTS,
        signal: stop,
      })
    } catch (err) {
      throw failure(err, deadline.aborted)
    }
    const checked = await this.checker.check(
      idea,
      found.map((f, i) => ({ ref: `${i}`, ...f })),
      MAX_RESEARCH_RESULTS,
      stop,
    )
    // Gone, or timed out, while the addresses were being looked at: keep nothing, like a failed search.
    stop.throwIfAborted()

    const id = store.transaction(() =>
      store.research.create(
        idea.id,
        { createdBy: user.id, areas: input.areas, provider, model },
        checked.map(({ ref: _ref, ...item }) => ({
          url: item.url,
          title: item.title,
          why: item.why,
          check: item.check,
          fetchedTitle: item.fetchedTitle,
          fetchedAuthors: item.fetchedAuthors,
        })),
      ),
    )
    return store.research.get(idea.id, id)!
  }

  /**
   * Adds pages to the reading list, marked as found by research and keeping the AI's reason. All or
   * nothing: a page that can't be added (it doesn't exist, it is already listed, or the list is full) refuses
   * the lot, with the reason, so the person can choose again.
   */
  add(idea: Idea, runId: string, itemIds: string[]): ResearchRun {
    const { store } = this.d
    const run = this.find(idea, runId)
    store.transaction(() => {
      const chosen = [...new Set(itemIds)].map((id) => {
        const item = run.items.find((i) => i.id === id)
        if (!item) throw fail(404, 'Not found')
        return item
      })
      const current = store.ideas.get(idea.profileId, idea.id) ?? idea
      const listed = new Set(current.links.map((l) => linkKey(l.url)))
      if (current.links.length + chosen.length > MAX_IDEA_LINKS) {
        throw fail(
          409,
          `An idea can have up to ${MAX_IDEA_LINKS} links. Remove some you no longer need to make room.`,
        )
      }
      for (const item of chosen) {
        const name = item.fetchedTitle || item.title || item.url
        if (item.status !== 'suggested') throw fail(409, `“${name}” was already dealt with.`)
        if (item.check === 'not-found') {
          throw fail(
            409,
            `We couldn't find a website at the address for “${name}”, so it can't be added. Choose another.`,
          )
        }
        if (item.check === 'not-public') {
          throw fail(
            409,
            `The address for “${name}” isn't a public website, so it can't be added. Choose another.`,
          )
        }
        if (listed.has(linkKey(item.url))) {
          throw fail(409, `“${name}” is already on the reading list. Choose another.`)
        }
        listed.add(linkKey(item.url))
      }
      for (const item of chosen) {
        const link = store.ideas.addLink(
          idea.id,
          {
            url: item.url,
            title: item.fetchedTitle ?? item.title,
            authors: item.fetchedAuthors,
            why: item.why,
          },
          'research',
        )
        store.research.markAdded(run.id, item.id, link.id)
      }
    })
    return this.find(idea, runId)
  }

  /** Ignores pages: they stay in the run, marked, and nothing is added. */
  dismiss(idea: Idea, runId: string, itemIds: string[]): ResearchRun {
    const run = this.find(idea, runId)
    for (const id of itemIds) {
      if (run.items.some((i) => i.id === id)) this.d.store.research.ignore(run.id, id)
    }
    return this.find(idea, runId)
  }

  /**
   * Takes a decision back: an ignored page is waiting again, and an added page is too, and is taken off the
   * reading list (unless the writer has already removed it). Notes taken from the item stay, as when any item
   * is removed, but lose their link to it.
   */
  reconsider(idea: Idea, runId: string, itemIds: string[]): ResearchRun {
    const { store } = this.d
    const run = this.find(idea, runId)
    store.transaction(() => {
      for (const id of itemIds) {
        if (!run.items.some((i) => i.id === id)) continue
        const reopened = store.research.reopen(run.id, id)
        if (reopened?.linkId) store.ideas.removeLink(idea.id, reopened.linkId)
      }
    })
    return this.find(idea, runId)
  }

  /** Forgets a run. Pages already added to the reading list stay there. */
  delete(idea: Idea, runId: string) {
    if (!this.d.store.research.delete(idea.id, runId)) throw fail(404, 'Not found')
  }

  private find(idea: Idea, runId: string): ResearchRun {
    const run = this.d.store.research.get(idea.id, runId)
    if (!run) throw fail(404, 'Not found')
    return run
  }
}

/** Says what went wrong with a search in terms a person can act on; never what was sent. */
function failure(err: unknown, timedOut: boolean): unknown {
  if (timedOut) return fail(504, 'The search took too long. Try again.')
  if (err instanceof LLMAuthError) {
    return fail(
      409,
      'Your AI provider rejected your API key. Update it in your account settings, then try again.',
    )
  }
  if (err instanceof LLMRateLimitError) {
    return fail(
      429,
      'Your AI provider is limiting requests for your key right now. Try again in a minute.',
    )
  }
  if (err instanceof LLMProviderError) {
    return fail(
      502,
      'The AI provider had a problem while searching. Web search must be switched on for your Anthropic account. Try again in a moment.',
    )
  }
  return err
}

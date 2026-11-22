import {
  linkKey,
  LLMAuthError,
  LLMProviderError,
  LLMRateLimitError,
  MAX_IDEA_ARTICLES,
  MAX_RESEARCH_RESULTS,
  RESEARCH_ATTEMPTS,
  RESEARCH_IN_FLIGHT_MAX,
  type Idea,
  type PageInfoFetcher,
  type ResearchInput,
  type ResearchProvider,
  type ResearchRun,
} from '@wordwright/core'
import { RESEARCH_PROMPT } from '@wordwright/prompts'
import type { RateLimiter } from '../auth/rate-limit'
import type { QueuedSearch } from '../db/research'
import type { Store } from '../db/store'
import { LlmError } from './llm'
import { ArticleChecker } from './article-suggestions'
import { usablePublicationDescription, publicationDescriptionBlock } from './publication-context'
import { describeError, fail } from '../errors'
import { escape, notesText, snapshotNotes, type SnapshotNote } from './idea-notes'

/** A search that takes longer than this is abandoned. */
const RESEARCH_TIMEOUT_MS = 180_000

/**
 * What the researcher is given: what the writer wants to look into (the main thing), the idea's title and notes for
 * context, the writer's description of the publication if they have written one, and the addresses already on the reading
 * list. All of it is the writer's own words (a quotation is marked as someone else's, as in the Refine snapshot), so it
 * is escaped, and `prompts/research.md` tells the researcher to treat it as material. Never the text of a draft.
 */
export function formatResearchBrief(
  idea: Idea,
  areas: string,
  publicationDescription: string | null = null,
  /** The notes one by one, so a quotation can be told from the writer's own point (else `idea.notes` is used). */
  notes?: SnapshotNote[],
): string {
  return [
    '<areas_to_research>',
    escape(areas),
    '</areas_to_research>',
    '<idea>',
    `Idea title: ${escape(idea.name)}`,
    'Notes:',
    notesText(notes) ?? (idea.notes.trim() ? escape(idea.notes) : '(none yet)'),
    '</idea>',
    ...[publicationDescriptionBlock(publicationDescription)].filter((block) => block !== null),
    '<already_on_the_reading_list>',
    ...(idea.articles.length ? idea.articles.map((l) => `- ${escape(l.url)}`) : ['(nothing yet)']),
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
  /** Per person: each search spends their money and makes the server look at several sites. */
  limiter: RateLimiter
  timeoutMs?: number
  /** How long to wait before the second and third automatic tries. */
  retryDelaysMs?: readonly number[]
  logger?: Pick<Console, 'error'>
}

/** Waits before the second and third tries of a round. */
const RETRY_DELAYS_MS = [30_000, 120_000]

const RESTARTED = 'This search stopped when the server restarted. Try again.'

/** A failed try: what to tell the writer, and whether trying again by itself might work. */
interface Failure {
  message: string
  transient: boolean
  /** Nothing reached the provider, so the search cost nothing. */
  free: boolean
  /** The provider asked us to wait this long first. */
  retryAfterMs?: number
}

/**
 * Research is kept apart from brainstorming: the writer describes the areas to look into, one request goes to their
 * own researcher, and what it finds is saved as a list to review. Nothing joins the articles until a person
 * adds it. Design: docs/adr/research-and-feeds/research-is-its-own-tool-and-the-ai-adds.md.
 *
 * A sent search belongs to the server (#447): it is saved at once as a waiting run and this service's queue runs it,
 * up to RESEARCH_IN_FLIGHT_MAX at once per publication, oldest first, retrying a failure that may clear by itself.
 * The queue lives in this process: see docs/adr/research-and-feeds/research-searches-run-in-a-server-queue.md.
 */
export class ResearchService {
  private readonly checker: ArticleChecker
  /** The searches running now, so they can be counted per publication and stopped. */
  private readonly active = new Map<
    string,
    { ideaId: string; publicationId: string; controller: AbortController }
  >()
  private timer: ReturnType<typeof setTimeout> | undefined
  private pumpQueued = false
  private stopped = false

  constructor(private readonly d: ResearchDeps) {
    this.checker = new ArticleChecker(d.pages)
    this.recover()
    this.kick()
  }

  list(idea: Idea): ResearchRun[] {
    return this.d.store.research.list(idea.id)
  }

  /**
   * Saves a search, waiting its turn, and returns it at once. Charged to the sender's hourly throttle now; a missing
   * key is said now too, rather than after the wait.
   */
  send(idea: Idea, user: { id: string }, input: ResearchInput): ResearchRun {
    const { store, limiter } = this.d
    if (!limiter.allow(user.id)) throw this.limitReached()
    let resolved
    try {
      resolved = this.d.resolveResearch(user.id)
    } catch (err) {
      limiter.refund(user.id)
      throw err
    }
    const id = store.research.queue(idea.id, {
      createdBy: user.id,
      areas: input.areas,
      provider: resolved.provider,
      model: resolved.model,
    })
    this.kick()
    return store.research.get(idea.id, id)!
  }

  /** The sender's one Try again on a failed search: another round, charged like a new search. */
  tryAgain(idea: Idea, runId: string, user: { id: string }): ResearchRun {
    const run = this.find(idea, runId)
    if (run.createdBy !== user.id)
      throw fail(403, 'Only the person who sent this search can try it again.')
    if (!run.canTryAgain)
      throw fail(409, 'This search can’t be tried again. Send it as a new search instead.')
    if (!this.d.limiter.allow(user.id)) throw this.limitReached()
    this.d.store.research.tryAgain(run.id)
    this.kick()
    return this.find(idea, runId)
  }

  /** The sender stops a search that is waiting or running, and it is deleted. */
  cancel(idea: Idea, runId: string, user: { id: string }) {
    const run = this.find(idea, runId)
    if (run.createdBy !== user.id)
      throw fail(403, 'Only the person who sent this search can cancel it.')
    if (run.state !== 'waiting' && run.state !== 'searching') {
      throw fail(409, 'This search has already finished.')
    }
    // Nothing of this round has reached the provider yet, so it gives back the search it was charged.
    if (run.state === 'waiting' && run.attempt === 1) this.d.limiter.refund(user.id)
    this.stop(run.id)
    this.d.store.research.delete(idea.id, run.id)
    this.kick()
  }

  /** Stops the searches of an idea that is being deleted (its runs go with it). */
  stopIdea(ideaId: string) {
    for (const [id, a] of this.active) if (a.ideaId === ideaId) this.stop(id)
  }

  /** Stops the worker, for a clean shutdown and between tests. */
  close() {
    this.stopped = true
    clearTimeout(this.timer)
    for (const id of [...this.active.keys()]) this.stop(id)
  }

  private limitReached() {
    const { limiter } = this.d
    return fail(
      429,
      `You’ve reached the limit of ${limiter.max} searches an hour. Try again in ${limiter.wait}.`,
    )
  }

  private stop(runId: string) {
    this.active.get(runId)?.controller.abort()
    this.active.delete(runId)
  }

  /** After a restart: a search that was running runs again, the restart counting as one of its tries. */
  private recover() {
    const { research } = this.d.store
    let queued: QueuedSearch[]
    try {
      queued = research.queued()
    } catch (err) {
      this.d.logger?.error(`Research queue failed to start: ${describeError(err)}`)
      return
    }
    for (const q of queued) {
      if (q.state !== 'searching') continue
      if (q.attempts >= RESEARCH_ATTEMPTS) research.fail(q.id, RESTARTED)
      else research.wait(q.id, null)
    }
  }

  /** Looks at the queue soon (once, however often it is asked). */
  private kick() {
    if (this.pumpQueued || this.stopped) return
    this.pumpQueued = true
    queueMicrotask(() => {
      this.pumpQueued = false
      try {
        this.pump()
      } catch (err) {
        // The database is unusable (the readiness check says so); the next search sent or finished looks again.
        this.d.logger?.error(`Research queue failed: ${describeError(err)}`)
      }
    })
  }

  /** Starts every waiting search that is due and has room in its publication; wakes again for the next retry. */
  private pump() {
    if (this.stopped) return
    const now = Date.now()
    const running = new Map<string, number>()
    for (const a of this.active.values()) {
      running.set(a.publicationId, (running.get(a.publicationId) ?? 0) + 1)
    }
    let nextAt: number | undefined
    for (const q of this.d.store.research.queued()) {
      if (q.state !== 'waiting') continue
      if (q.retryAt && Date.parse(q.retryAt) > now) {
        nextAt = Math.min(nextAt ?? Infinity, Date.parse(q.retryAt))
        continue
      }
      const n = running.get(q.publicationId) ?? 0
      if (n >= RESEARCH_IN_FLIGHT_MAX) continue
      running.set(q.publicationId, n + 1)
      this.attempt(q)
    }
    clearTimeout(this.timer)
    this.timer = undefined
    if (nextAt !== undefined) {
      this.timer = setTimeout(() => this.kick(), Math.max(0, nextAt - now))
      this.timer.unref?.()
    }
  }

  /** One try of a search. Registers it as running before it returns, so `pump` counts it at once. */
  private attempt(q: QueuedSearch) {
    const controller = new AbortController()
    this.active.set(q.id, { ideaId: q.ideaId, publicationId: q.publicationId, controller })
    const firstOfRound = q.attempts === 0
    void this.search(q, controller.signal)
      .then((failure) => {
        if (!failure || controller.signal.aborted) return
        this.failed(q, failure, firstOfRound)
      })
      .catch((err: unknown) => {
        // A bug, not the provider: say so plainly, and don't retry it.
        // By name and stack only: a message could carry what was sent.
        this.d.logger?.error(`Research search failed: ${describeError(err)}`)
        if (!controller.signal.aborted) {
          this.d.store.research.fail(
            q.id,
            'Sorry, something went wrong with this search. Please try again.',
          )
        }
      })
      .finally(() => {
        if (this.active.get(q.id)?.controller === controller) this.active.delete(q.id)
        this.kick()
      })
  }

  /** What to do after a failed try: wait and try again, or come back to the writer. */
  private failed(q: QueuedSearch, failure: Failure, firstOfRound: boolean) {
    const { store, limiter } = this.d
    const tries = store.research.get(q.ideaId, q.id)?.attempt ?? q.attempts
    if (failure.free && firstOfRound && q.createdBy) limiter.refund(q.createdBy)
    if (failure.transient && tries < RESEARCH_ATTEMPTS) {
      const delays = this.d.retryDelaysMs ?? RETRY_DELAYS_MS
      const wait = Math.max(delays[tries - 1] ?? delays.at(-1) ?? 0, failure.retryAfterMs ?? 0)
      store.research.wait(q.id, new Date(Date.now() + wait).toISOString())
    } else {
      store.research.fail(q.id, failure.message)
    }
  }

  /** Runs one try. Resolves with nothing when the pages are saved (or the run went meanwhile), else why it failed. */
  private async search(q: QueuedSearch, cancelled: AbortSignal): Promise<Failure | undefined> {
    const { store } = this.d
    const idea = store.ideas.get(q.publicationId, q.ideaId)
    if (!idea) return undefined // deleted meanwhile; its runs went with it
    if (!q.createdBy || !store.publications.roleOf(q.publicationId, q.createdBy)) {
      return {
        message: 'The person who sent this search is no longer a member of this publication.',
        transient: false,
        free: true,
      }
    }
    let resolved
    try {
      resolved = this.d.resolveResearch(q.createdBy)
    } catch (err) {
      if (err instanceof LlmError) return { message: err.message, transient: false, free: true }
      throw err
    }
    const { research, provider, model } = resolved
    if (!store.research.start(q.id, provider, model)) return undefined // cancelled before it began

    const deadline = AbortSignal.timeout(this.d.timeoutMs ?? RESEARCH_TIMEOUT_MS)
    const stop = AbortSignal.any([cancelled, deadline])
    try {
      const found = await research.find({
        system: RESEARCH_PROMPT,
        brief: formatResearchBrief(
          idea,
          q.areas,
          usablePublicationDescription(store.publications.get(idea.publicationId, q.createdBy)),
          snapshotNotes(store, idea),
        ),
        maxResults: MAX_RESEARCH_RESULTS,
        signal: stop,
      })
      const checked = await this.checker.check(
        idea,
        found.map((f, i) => ({ ref: `${i}`, ...f })),
        MAX_RESEARCH_RESULTS,
        stop,
      )
      // Cancelled, or timed out, while the addresses were being looked at: keep nothing, like a failed search.
      stop.throwIfAborted()
      store.transaction(() =>
        store.research.finish(
          q.id,
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
      return undefined
    } catch (err) {
      if (cancelled.aborted) return undefined
      return failure(err, deadline.aborted)
    }
  }

  /**
   * Adds pages to the articles, marked as found by research and keeping the AI's reason. All or
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
      const current = store.ideas.get(idea.publicationId, idea.id) ?? idea
      const listed = new Set(current.articles.map((l) => linkKey(l.url)))
      if (current.articles.length + chosen.length > MAX_IDEA_ARTICLES) {
        throw fail(
          409,
          `An idea can have up to ${MAX_IDEA_ARTICLES} articles. Remove some you no longer need to make room.`,
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
          throw fail(409, `“${name}” is already in the articles. Choose another.`)
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
   * articles (unless the writer has already removed it). Notes taken from the item stay, as when any item
   * is removed, but lose their link to it.
   */
  reconsider(idea: Idea, runId: string, itemIds: string[]): ResearchRun {
    const { store } = this.d
    const run = this.find(idea, runId)
    store.transaction(() => {
      for (const id of itemIds) {
        if (!run.items.some((i) => i.id === id)) continue
        const reopened = store.research.reopen(run.id, id)
        if (reopened?.articleId) store.ideas.removeLink(idea.id, reopened.articleId)
      }
    })
    return this.find(idea, runId)
  }

  /** Forgets a run. Pages already added to the articles stay there. */
  delete(idea: Idea, runId: string) {
    this.find(idea, runId)
    this.stop(runId)
    this.d.store.research.delete(idea.id, runId)
    this.kick()
  }

  private find(idea: Idea, runId: string): ResearchRun {
    const run = this.d.store.research.get(idea.id, runId)
    if (!run) throw fail(404, 'Not found')
    return run
  }
}

/** Says what went wrong with a try in terms a person can act on (never what was sent), and whether to retry it. */
function failure(err: unknown, timedOut: boolean): Failure {
  if (timedOut)
    return { message: 'The search took too long. Try again.', transient: true, free: false }
  if (err instanceof LLMAuthError) {
    return {
      message:
        'Your AI provider rejected your API key. Update it in your account settings, then try again.',
      transient: false,
      free: false,
    }
  }
  if (err instanceof LLMRateLimitError) {
    return {
      message:
        'Your AI provider is limiting requests for your key right now. Try again in a minute.',
      transient: true,
      free: false,
      retryAfterMs: err.retryAfterSeconds === undefined ? undefined : err.retryAfterSeconds * 1000,
    }
  }
  if (err instanceof LLMProviderError) {
    return {
      message:
        'The AI provider had a problem while searching. Web search must be switched on for your Anthropic account. Try again in a moment.',
      transient: true,
      free: false,
    }
  }
  throw err
}

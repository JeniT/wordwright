import { HTTPException } from 'hono/http-exception'
import {
  linkKey,
  MAX_IDEA_LINKS,
  type Idea,
  type IdeaLinkInput,
  type PageInfoFetcher,
} from '@lfwa/core'
import type { RateLimiter } from '../auth/rate-limit'
import type { Store } from '../db/store'

const fail = (status: 400 | 404 | 409 | 429, message: string) =>
  new HTTPException(status, { message })

/**
 * Adding and editing an idea's related-work links. Looking a page up costs a request to someone
 * else's server, so it's rate-limited per person, and a link is only saved once the lookup has
 * said the address is a real, public site. A page that merely can't be read (blocked, slow, no
 * title) is fine: the link is kept and shows its address.
 */
export class IdeaLinkService {
  constructor(
    private readonly deps: { store: Store; pages: PageInfoFetcher; limiter: RateLimiter },
  ) {}

  /** Adds a link and answers with the whole idea. */
  async add(idea: Idea, userId: string, input: IdeaLinkInput, signal?: AbortSignal): Promise<Idea> {
    const { store } = this.deps
    this.checkRoom(idea)
    this.checkNotDuplicate(idea, input.url)
    const title = input.title || (await this.lookUp(userId, input.url, signal))

    // The lookup took time, so look again at what's there now before writing.
    const fresh = this.current(idea)
    this.checkRoom(fresh)
    this.checkNotDuplicate(fresh, input.url)
    store.ideas.addLink(idea.id, { url: input.url, title })
    return this.current(idea)
  }

  /**
   * Changes a link's address and/or title. A blank title, or an address changed without also
   * changing the title, asks for the title to be fetched again.
   */
  async update(
    idea: Idea,
    linkId: string,
    userId: string,
    input: IdeaLinkInput,
    signal?: AbortSignal,
  ): Promise<Idea> {
    const { store } = this.deps
    const existing = idea.links.find((l) => l.id === linkId)
    if (!existing) throw fail(404, 'Not found')
    this.checkNotDuplicate(idea, input.url, linkId)

    const addressChanged = input.url !== existing.url
    const titleChanged = input.title !== existing.title
    let title = input.title
    if (!input.title || (addressChanged && !titleChanged)) {
      title = await this.lookUp(userId, input.url, signal)
    } else if (addressChanged) {
      await this.lookUp(userId, input.url, signal) // chosen title kept, but the address must be real
    }

    const fresh = this.current(idea)
    if (!fresh.links.some((l) => l.id === linkId)) throw fail(404, 'Not found')
    this.checkNotDuplicate(fresh, input.url, linkId)
    store.ideas.updateLink(idea.id, linkId, { url: input.url, title })
    return this.current(idea)
  }

  private current(idea: Idea): Idea {
    return this.deps.store.ideas.get(idea.profileId, idea.id) ?? idea
  }

  private checkRoom(idea: Idea) {
    if (idea.links.length >= MAX_IDEA_LINKS) {
      throw fail(
        409,
        `An idea can have up to ${MAX_IDEA_LINKS} links. Remove one you no longer need to make room.`,
      )
    }
  }

  private checkNotDuplicate(idea: Idea, url: string, ignoring?: string) {
    const key = linkKey(url)
    if (idea.links.some((l) => l.id !== ignoring && linkKey(l.url) === key)) {
      throw fail(409, 'That link is already in this idea.')
    }
  }

  /** The page's title ('' if it has none), refusing addresses that aren't real public sites. */
  private async lookUp(userId: string, url: string, signal?: AbortSignal): Promise<string> {
    if (!this.deps.limiter.allow(userId)) {
      throw fail(429, "You're adding links very quickly. Wait a minute and try again.")
    }
    const info = await this.deps.pages.fetchInfo(url, signal)
    if (info.problem === 'not-found') {
      throw fail(400, "We couldn't find a website at that address. Check it for typos.")
    }
    if (info.problem === 'not-public') {
      throw fail(400, "That address isn't a public website, so it can't be added as a link.")
    }
    return info.title ?? ''
  }
}

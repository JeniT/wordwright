import {
  linkKey,
  MAX_IDEA_LINKS,
  type IdeaLink,
  type IdeaLinkInput,
  type PageInfoFetcher,
} from '@lfwa/core'
import type { RateLimiter } from '../auth/rate-limit'
import type { Store } from '../db/store'
import { hereOf, ownerOf, subjectOf, touch, type ListScope } from './scope'
import { fail } from '../errors'
import { changeTags, sameTagList } from './tag-change'

/**
 * Adding and editing the items of an idea's reading list, or of the publication's. Looking a page up costs a request to someone
 * else's server, so it's rate-limited per person, and a link is only saved once the lookup has
 * said the address is a real, public site. A page that merely can't be read (blocked, slow, no
 * title) is fine: the link is kept and shows its address.
 */
export class IdeaLinkService {
  constructor(
    private readonly deps: { store: Store; pages: PageInfoFetcher; limiter: RateLimiter },
  ) {}

  /**
   * Adds and removes tags on the chosen items in one go, all or nothing (an item that would end with too many tags
   * refuses the whole change). Answers with the whole reading list.
   */
  tagMany(scope: ListScope, ids: string[], add: string[], remove: string[]): IdeaLink[] {
    const { store } = this.deps
    const owner = ownerOf(scope)
    return store.transaction(() => {
      const wanted = new Set(ids)
      const chosen = store.reading.list(owner).filter((l) => wanted.has(l.id))
      if (chosen.length !== wanted.size) throw fail(404, 'Not found')
      const changes = chosen.flatMap((link) => {
        const next = changeTags(link.tags, add, remove, {
          kind: 'link',
          label: link.title || link.url,
        })
        return sameTagList(next, link.tags) ? [] : [{ id: link.id, tags: next }]
      })
      for (const change of changes) store.reading.setTags(owner, change.id, change.tags)
      if (changes.length) touch(store, scope)
      return store.reading.list(owner)
    })
  }

  /** Adds a link and answers with the whole reading list. */
  async add(
    scope: ListScope,
    userId: string,
    input: IdeaLinkInput,
    signal?: AbortSignal,
  ): Promise<IdeaLink[]> {
    const { store } = this.deps
    this.checkRoom(scope, this.current(scope))
    this.checkNotDuplicate(scope, this.current(scope), input.url)
    // Looking the page up gives its title and who wrote it, unless the writer already said what the title is.
    const found = input.title ? null : await this.lookUp(userId, input.url, signal)
    const title = input.title || found?.title || ''
    const authors = input.authors?.length ? input.authors : (found?.authors ?? [])

    // The lookup took time, so look again at what's there now before writing.
    const fresh = this.current(scope)
    this.checkRoom(scope, fresh)
    this.checkNotDuplicate(scope, fresh, input.url)
    store.reading.add(scope.publicationId, scope.ideaId, { url: input.url, title, authors })
    touch(store, scope)
    return this.current(scope)
  }

  /**
   * Changes a link's address, title and/or authors. A blank title, or an address changed without also
   * changing the title, asks for the page to be looked up again. Authors the writer gives are kept as given; when
   * none are given they stay as they are, unless the page was looked up again: then an empty list, or a different
   * address, takes what the page says (and a lookup that finds no one leaves them empty or as they were).
   */
  async update(
    scope: ListScope,
    linkId: string,
    userId: string,
    input: IdeaLinkInput,
    signal?: AbortSignal,
  ): Promise<IdeaLink[]> {
    const { store } = this.deps
    const links = this.current(scope)
    const existing = links.find((l) => l.id === linkId)
    if (!existing) throw fail(404, 'Not found')
    this.checkNotDuplicate(scope, links, input.url, linkId)

    const addressChanged = input.url !== existing.url
    const titleChanged = input.title !== existing.title
    let title = input.title
    let authors = input.authors ?? existing.authors
    if (!input.title || (addressChanged && !titleChanged)) {
      const found = await this.lookUp(userId, input.url, signal)
      title = found.title
      const wantsDetected = input.authors ? input.authors.length === 0 : addressChanged
      if (wantsDetected)
        authors = found.authors.length ? found.authors : addressChanged ? [] : authors
    } else if (addressChanged) {
      await this.lookUp(userId, input.url, signal) // chosen title kept, but the address must be real
    }

    const fresh = this.current(scope)
    if (!fresh.some((l) => l.id === linkId)) throw fail(404, 'Not found')
    this.checkNotDuplicate(scope, fresh, input.url, linkId)
    store.reading.update(ownerOf(scope), linkId, { url: input.url, title, authors })
    touch(store, scope)
    return this.current(scope)
  }

  private current(scope: ListScope): IdeaLink[] {
    return this.deps.store.reading.list(ownerOf(scope))
  }

  private checkRoom(scope: ListScope, links: IdeaLink[]) {
    // The publication's own list has no maximum: what isn't kept drops off after a month instead.
    if (scope.ideaId && links.length >= MAX_IDEA_LINKS) {
      throw fail(
        409,
        `${subjectOf(scope)} can have up to ${MAX_IDEA_LINKS} links. Remove one you no longer need to make room.`,
      )
    }
  }

  private checkNotDuplicate(scope: ListScope, links: IdeaLink[], url: string, ignoring?: string) {
    const key = linkKey(url)
    if (links.some((l) => l.id !== ignoring && linkKey(l.url) === key)) {
      throw fail(409, `That link is already in ${hereOf(scope)}.`)
    }
  }

  /** The page's title ('' if it has none) and authors, refusing addresses that aren't real public sites. */
  private async lookUp(
    userId: string,
    url: string,
    signal?: AbortSignal,
  ): Promise<{ title: string; authors: string[] }> {
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
    return { title: info.title ?? '', authors: info.authors ?? [] }
  }
}

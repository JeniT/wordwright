import {
  linkKey,
  type FeedItem,
  type PostDecision,
  type PostRefs,
  type PostStatus,
} from '@wordwright/core'
import type { Store } from '../db/store'
import { fail } from '../errors'

/**
 * What has become of each post of a publication's feeds: on a list of articles (added here, or by hand), ignored by
 * someone, or still new. Looked up by address, so the same post in two feeds is one thing.
 */
function postStatuses(store: Store, publicationId: string): (url: string) => PostStatus {
  const states = postStates(store, publicationId)
  return (url) => states(url).status
}

/** A post's status, and when it was decided (when ignored, or when the item went on a list; null while new). */
export function postStates(
  store: Store,
  publicationId: string,
): (url: string) => { status: PostStatus; decidedAt: string | null } {
  const ignored = store.feedDecisions.ignored(publicationId)
  const listed = new Map<string, string>() // the latest time an item with this address was put on a list
  for (const { url, createdAt } of store.articles.addresses(publicationId)) {
    const key = linkKey(url)
    if (!listed.has(key) || createdAt > listed.get(key)!) listed.set(key, createdAt)
  }
  return (url) => {
    const key = linkKey(url)
    if (listed.has(key)) return { status: 'added', decidedAt: listed.get(key)! }
    if (ignored.has(key)) return { status: 'ignored', decidedAt: ignored.get(key)! }
    return { status: 'new', decidedAt: null }
  }
}

/**
 * Adding posts from the publication's feeds to its articles, ignoring them, and taking either back: the
 * research review's Add / Ignore / Reconsider, for posts. The post is read from the copy of the feed the server
 * kept (never from what the browser sends), so only what a feed really said can be added. Nothing is fetched.
 */
export class FeedPostService {
  constructor(private readonly store: Store) {}

  /**
   * Puts the posts in the publication's articles, marked as from a feed. All or nothing: a post that is already
   * on a list of articles refuses the lot, with the reason. The publication's list has no maximum.
   */
  add(publicationId: string, userId: string, refs: PostRefs['posts']): PostDecision {
    const { articles, feedDecisions } = this.store
    return this.store.transaction(() => {
      const posts = this.find(publicationId, refs)
      const status = postStatuses(this.store, publicationId)
      const seen = new Set<string>()
      for (const { item } of posts) {
        const key = linkKey(item.url)
        if (status(item.url) === 'added' || seen.has(key)) {
          throw fail(409, `“${item.title}” is already on a list of articles. Choose another.`)
        }
        seen.add(key)
      }
      for (const { item, sourceId } of posts) {
        articles.add(
          publicationId,
          null,
          { url: item.url, title: item.title, authors: item.authors, sourceId },
          'feed',
        )
        feedDecisions.unignore(publicationId, linkKey(item.url)) // added after all
      }
      return this.results(publicationId, refs)
    })
  }

  /** Ignores posts: they stay in the list, marked, and nothing is added. */
  ignore(publicationId: string, userId: string, refs: PostRefs['posts']): PostDecision {
    return this.store.transaction(() => {
      const posts = this.find(publicationId, refs)
      const status = postStatuses(this.store, publicationId)
      for (const { item } of posts) {
        if (status(item.url) === 'added') {
          throw fail(
            409,
            `“${item.title}” is already on a list of articles, so it can't be ignored.`,
          )
        }
      }
      for (const { item } of posts) {
        this.store.feedDecisions.ignore(publicationId, linkKey(item.url), userId)
      }
      return this.results(publicationId, refs)
    })
  }

  /**
   * Takes a decision back: an ignored post is new again, and an added post is too, and comes off the publication's
   * articles (notes taken from it stay, but lose their link to it, as when any item is removed). A post that is on
   * one of the ideas' lists, not the publication's own, has to be taken off there.
   */
  reconsider(publicationId: string, refs: PostRefs['posts']): PostDecision {
    const { articles, feedDecisions } = this.store
    return this.store.transaction(() => {
      const posts = this.find(publicationId, refs)
      for (const { item } of posts) {
        const key = linkKey(item.url)
        feedDecisions.unignore(publicationId, key)
        for (const link of articles.list({ publicationId })) {
          if (linkKey(link.url) === key) articles.remove({ publicationId }, link.id)
        }
        if (postStatuses(this.store, publicationId)(item.url) === 'added') {
          throw fail(
            409,
            `“${item.title}” is on an idea's articles, so take it off there if you no longer want it.`,
          )
        }
      }
      return this.results(publicationId, refs)
    })
  }

  /** Each post, from the kept copy of its feed. A feed that isn't this publication's is not found. */
  private find(
    publicationId: string,
    refs: PostRefs['posts'],
  ): { item: FeedItem; sourceId: string }[] {
    const { sources } = this.store
    return refs.map(({ sourceId, postId }) => {
      if (!sources.find(publicationId, sourceId)) throw fail(404, 'Not found')
      const item = sources.getFetch(sourceId)?.items.find((i) => i.id === postId)
      if (!item) {
        throw fail(
          409,
          "That post isn't in the feed's recent posts any more. Check for new posts and try again.",
        )
      }
      return { item, sourceId }
    })
  }

  private results(publicationId: string, refs: PostRefs['posts']): PostDecision {
    const status = postStatuses(this.store, publicationId)
    const kept = (sourceId: string, postId: string) =>
      this.store.sources.getFetch(sourceId)?.items.find((i) => i.id === postId)
    return {
      results: refs.map(({ sourceId, postId }) => ({
        sourceId,
        postId,
        status: status(kept(sourceId, postId)!.url),
      })),
    }
  }
}

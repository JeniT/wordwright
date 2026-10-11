import { HTTPException } from 'hono/http-exception'
import {
  linkKey,
  MAX_IDEA_LINKS,
  type FeedItem,
  type PostDecision,
  type PostRefs,
  type PostStatus,
} from '@lfwa/core'
import type { Store } from '../db/store'

const fail = (status: 400 | 404 | 409, message: string) => new HTTPException(status, { message })

/**
 * What has become of each post of a profile's feeds: on a reading list (added here, or by hand), ignored by
 * someone, or still new. Looked up by address, so the same post in two feeds is one thing.
 */
export function postStatuses(store: Store, profileId: string): (url: string) => PostStatus {
  const ignored = store.feedDecisions.ignored(profileId)
  const listed = new Set(store.reading.urls(profileId).map(linkKey))
  return (url) => {
    const key = linkKey(url)
    if (listed.has(key)) return 'added'
    return ignored.has(key) ? 'ignored' : 'new'
  }
}

/**
 * Adding posts from the profile's feeds to its reading list, ignoring them, and taking either back: the
 * research review's Add / Ignore / Reconsider, for posts. The post is read from the copy of the feed the server
 * kept (never from what the browser sends), so only what a feed really said can be added. Nothing is fetched.
 */
export class FeedPostService {
  constructor(private readonly store: Store) {}

  /**
   * Puts the posts on the profile's reading list, marked as from a feed. All or nothing: a post that is already
   * on a reading list, or an address the list has no room for, refuses the lot, with the reason.
   */
  add(profileId: string, userId: string, refs: PostRefs['posts']): PostDecision {
    const { reading, feedDecisions } = this.store
    return this.store.transaction(() => {
      const posts = this.find(profileId, refs)
      const status = postStatuses(this.store, profileId)
      const seen = new Set<string>()
      for (const { item } of posts) {
        const key = linkKey(item.url)
        if (status(item.url) === 'added' || seen.has(key)) {
          throw fail(409, `“${item.title}” is already on a reading list. Choose another.`)
        }
        seen.add(key)
      }
      if (reading.count({ profileId }) + posts.length > MAX_IDEA_LINKS) {
        throw fail(
          409,
          `A profile can have up to ${MAX_IDEA_LINKS} links. Remove some you no longer need to make room.`,
        )
      }
      for (const { item, sourceId } of posts) {
        reading.add(
          profileId,
          null,
          { url: item.url, title: item.title, authors: item.authors, sourceId },
          'feed',
        )
        feedDecisions.unignore(profileId, linkKey(item.url)) // added after all
      }
      return this.results(profileId, refs)
    })
  }

  /** Ignores posts: they stay in the list, marked, and nothing is added. */
  ignore(profileId: string, userId: string, refs: PostRefs['posts']): PostDecision {
    return this.store.transaction(() => {
      const posts = this.find(profileId, refs)
      const status = postStatuses(this.store, profileId)
      for (const { item } of posts) {
        if (status(item.url) === 'added') {
          throw fail(409, `“${item.title}” is already on a reading list, so it can't be ignored.`)
        }
      }
      for (const { item } of posts) {
        this.store.feedDecisions.ignore(profileId, linkKey(item.url), userId)
      }
      return this.results(profileId, refs)
    })
  }

  /**
   * Takes a decision back: an ignored post is new again, and an added post is too, and comes off the profile's
   * reading list (notes taken from it stay, but lose their link to it, as when any item is removed). A post that is on
   * one of the ideas' lists, not the profile's own, has to be taken off there.
   */
  reconsider(profileId: string, refs: PostRefs['posts']): PostDecision {
    const { reading, feedDecisions } = this.store
    return this.store.transaction(() => {
      const posts = this.find(profileId, refs)
      for (const { item } of posts) {
        const key = linkKey(item.url)
        feedDecisions.unignore(profileId, key)
        for (const link of reading.list({ profileId })) {
          if (linkKey(link.url) === key) reading.remove({ profileId }, link.id)
        }
        if (postStatuses(this.store, profileId)(item.url) === 'added') {
          throw fail(
            409,
            `“${item.title}” is on an idea's reading list, so take it off there if you no longer want it.`,
          )
        }
      }
      return this.results(profileId, refs)
    })
  }

  /** Each post, from the kept copy of its feed. A feed that isn't this profile's is not found. */
  private find(profileId: string, refs: PostRefs['posts']): { item: FeedItem; sourceId: string }[] {
    const { sources } = this.store
    return refs.map(({ sourceId, postId }) => {
      if (!sources.find(profileId, sourceId)) throw fail(404, 'Not found')
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

  private results(profileId: string, refs: PostRefs['posts']): PostDecision {
    const status = postStatuses(this.store, profileId)
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

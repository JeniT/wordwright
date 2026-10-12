import {
  PROFILE_DESCRIPTION_MAX,
  type LLMProvider,
  type LLMRequest,
  type VenueDraft,
} from '@lfwa/core'
import { VENUE_DESCRIPTION_PROMPT } from '@lfwa/prompts'
import type { RateLimiter } from '../auth/rate-limit'
import type { Store } from '../db/store'
import { fail } from '../errors'
import type { VenueSampleService } from './venue-samples'

/** The most the model may write: about 250 words, with room for a model that is a little wordy. */
const MAX_TOKENS = 1200

/** Keeps the posts' text from closing or imitating the tags it sits in. */
const escape = (text: string) => text.replace(/</g, '&lt;').replace(/>/g, '&gt;')
const attribute = (text: string) => escape(text).replace(/"/g, '&quot;')

export interface SamplePost {
  url: string
  title: string | null
  text: string
}

/**
 * What the model is given: the sample posts, numbered so it can say which shows what. They are text from other
 * websites, i.e. untrusted: escaped, and `prompts/venue-description.md` says to treat them as material, never as
 * instructions. The evals use this too.
 */
export function formatSamples(posts: SamplePost[]): string {
  return [
    '<sample_posts>',
    ...posts.map((post, i) =>
      [
        `<post number="${i + 1}" address="${attribute(post.url)}"${post.title ? ` title="${attribute(post.title)}"` : ''}>`,
        escape(post.text),
        '</post>',
      ].join('\n'),
    ),
    '</sample_posts>',
  ].join('\n')
}

export const venueDescriptionRequest = (posts: SamplePost[]): LLMRequest => ({
  system: VENUE_DESCRIPTION_PROMPT,
  messages: [{ role: 'user', content: formatSamples(posts) }],
  maxTokens: MAX_TOKENS,
})

export interface VenueDescriptionDeps {
  store: Store
  samples: VenueSampleService
  /** The person's own client; throws `LlmError` if they have no key. */
  resolveLlm: (userId: string) => LLMProvider
  /** Per profile: each draft spends someone's money, and the writer is meant to edit it, not re-roll it. */
  limiter: RateLimiter
}

/**
 * Drafts a venue description from sample posts, on the rung of the assistance ladder that *reflects*: it says what
 * the posts show, and the result is the writer's to correct. It is saved as an AI draft (origin `inferred`, the
 * addresses it was drawn from, not confirmed), so it is never used as context until a person accepts it.
 */
export class VenueDescriptionService {
  constructor(private readonly d: VenueDescriptionDeps) {}

  async draft(
    profileId: string,
    userId: string,
    input: { urls: string[]; replace: boolean },
    signal?: AbortSignal,
  ): Promise<VenueDraft> {
    const { store } = this.d
    const before = store.profiles.get(profileId, userId)
    // Someone's own words are not overwritten by accident.
    if (before?.description && before.descriptionOrigin === 'entered' && !input.replace) {
      throw fail(
        409,
        'This venue already has a description. Edit it yourself, or choose to replace it with a draft.',
      )
    }
    const llm = this.d.resolveLlm(userId)

    const read = await this.d.samples.read(input.urls)
    const posts = read.flatMap((s) => (s.ok ? [{ url: s.url, title: s.title, text: s.text }] : []))
    const skipped = read.flatMap((s) => (s.ok ? [] : [{ url: s.url, message: s.message }]))
    if (!posts.length) {
      throw fail(
        422,
        'None of those posts could be read, so there is nothing to draw a description from. Check the links, or choose other posts.',
      )
    }
    if (!this.d.limiter.allow(profileId)) {
      throw fail(
        429,
        'This venue has had several drafts already. Edit the description by hand, or try again in a while.',
      )
    }

    const reply = (await llm.complete({ ...venueDescriptionRequest(posts), signal })).trim()
    if (!reply || reply.length > PROFILE_DESCRIPTION_MAX) {
      throw fail(502, 'The AI sent back something we could not use. Please try again.')
    }
    store.profiles.setInferredDescription(
      profileId,
      reply,
      posts.map((p) => p.url),
    )
    return { profile: store.profiles.get(profileId, userId)!, skipped }
  }

  /** The writer accepts an AI draft as it stands. A hand-written description needs no confirming. */
  confirm(profileId: string, userId: string) {
    const { store } = this.d
    const profile = store.profiles.get(profileId, userId)
    if (!profile?.description) throw fail(409, 'There is no description to confirm.')
    store.profiles.confirmDescription(profileId)
    return store.profiles.get(profileId, userId)!
  }
}

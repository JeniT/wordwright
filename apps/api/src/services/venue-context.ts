import type { Profile } from '@lfwa/core'

/** Keeps text we insert from closing or imitating the tags it sits in. */
export const escape = (text: string) => text.replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * The writer's description of the venue, if there is one the AI may be told: the writer's own words, trimmed. A blank
 * one says nothing.
 */
export function usableVenueDescription(
  profile: Pick<Profile, 'description'> | undefined,
): string | null {
  return profile?.description?.trim() || null
}

/**
 * The description as the block every AI call puts it in. It is the writer's own words about their venue, i.e.
 * untrusted text like their notes: escaped so it can't close the block, and the prompts say to treat it as
 * material, never as instructions. Null (so, no block at all) when there is nothing to tell.
 */
export function venueDescriptionBlock(description: string | null): string | null {
  return description
    ? ['<venue_description>', escape(description), '</venue_description>'].join('\n')
    : null
}

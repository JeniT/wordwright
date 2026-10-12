import type { Profile } from '@lfwa/core'

/** Keeps text we insert from closing or imitating the tags it sits in. */
const escape = (text: string) => text.replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * The writer's description of the venue, if there is one the AI may be told: written (or accepted) by a person.
 * An AI-drafted description nobody has confirmed is shown to the writer but is never sent to a model (#27), and
 * a blank one says nothing.
 */
export function usableVenueDescription(
  profile: Pick<Profile, 'description' | 'descriptionOrigin' | 'descriptionConfirmed'> | undefined,
): string | null {
  const text = profile?.description?.trim()
  if (!text) return null
  if (profile!.descriptionOrigin === 'inferred' && !profile!.descriptionConfirmed) return null
  return text
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

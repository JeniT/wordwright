import type { Publication } from '@lfwa/core'

/** Keeps text we insert from closing or imitating the tags it sits in. */
export const escapeTags = (text: string) => text.replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * The writer's description of the publication, if there is one the AI may be told: the writer's own words, trimmed. A blank
 * one says nothing.
 */
export function usablePublicationDescription(
  publication: Pick<Publication, 'description'> | undefined,
): string | null {
  return publication?.description?.trim() || null
}

/**
 * The description as the block every AI call puts it in. It is the writer's own words about their publication, i.e.
 * untrusted text like their notes: escaped so it can't close the block, and the prompts say to treat it as
 * material, never as instructions. Null (so, no block at all) when there is nothing to tell.
 */
export function publicationDescriptionBlock(description: string | null): string | null {
  return description
    ? ['<publication_description>', escapeTags(description), '</publication_description>'].join(
        '\n',
      )
    : null
}

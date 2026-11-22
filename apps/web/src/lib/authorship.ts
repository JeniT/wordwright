import { computed, type MaybeRefOrGetter } from 'vue'
import { useSessionStore } from '../stores/session'
import { usePublication } from './usePublications'

/**
 * Whether to name who wrote something (a note, a comment, a Refine message, a draft's editor) with a `PersonChip`.
 * The chip says who, so it is only worth showing where it could be someone else: in a publication with other members,
 * or, for comments, once a reviewer or the AI could have written some. Where the only possible author is the person
 * looking, it is noise, and so is the screen-reader "recorded by" that goes with it. The AI's own marking ("Your AI")
 * is not a person's chip and is always shown.
 *
 * Until the publication has loaded, everyone is named, so chips don't appear a moment after the page does.
 */
export function useAuthorship(publicationId: MaybeRefOrGetter<string>) {
  const session = useSessionStore()
  const { publication } = usePublication(publicationId)
  const me = computed(() => session.user?.id ?? null)
  /** Another member could have written things here. */
  const shared = computed(() => {
    const p = publication.value
    return !p || p.members.some((m) => m.userId !== me.value)
  })
  /**
   * Name the author of this item. `othersToo`: someone who is not a member could also have written here (a draft sent
   * for review, or critiqued by the AI). An item written by someone else (a former member, null) is always named.
   */
  function named(authorId: string | null | undefined, othersToo = false): boolean {
    return shared.value || othersToo || authorId !== me.value
  }
  return { shared, named }
}

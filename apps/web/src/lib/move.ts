import { useMutation, useQueryClient } from '@tanstack/vue-query'
import type { MoveResult, MoveTarget } from '@wordwright/core'
import { computed, reactive, ref } from 'vue'
import { api } from './api'
import { invalidateRoots, useIdeas } from './queries'
import { usePublications } from './usePublications'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** "Moved 2 items and 5 notes to “Rivers”." */
export function moveSummary(result: MoveResult, destination: string): string {
  const parts = []
  if (result.readingItems) parts.push(plural(result.readingItems, 'item', 'items'))
  if (result.notes) parts.push(plural(result.notes, 'note', 'notes'))
  const what = parts.length ? parts.join(' and ') : 'nothing'
  const joined = result.merged
    ? ` ${plural(result.merged, 'item was', 'items were')} already there, so ${result.merged === 1 ? 'it was' : 'they were'} joined with ${result.merged === 1 ? 'it' : 'them'}.`
    : ''
  const copied = result.copied
    ? ` ${plural(result.copied, 'source was', 'sources were')} copied so the notes keep ${result.copied === 1 ? 'it' : 'them'}.`
    : ''
  return `Moved ${what} to ${destination}.${joined}${copied}`
}

/** What a move asks for: where the things are now (`from`) and where they go. */
interface MoveRequest {
  ids: string[]
  from: string | null
  to: string | null
  /** Set when they go to another publication. */
  toPublicationId?: string
  toName: string
}
const targetOf = (v: MoveRequest): MoveTarget =>
  v.toPublicationId ? { ideaId: v.to, publicationId: v.toPublicationId } : { ideaId: v.to }

/**
 * Moving reading items (and, later, notes) between the publication's own lists and its ideas, saying what happened
 * and, where it can, offering to put it back. Everything that shows a list is refreshed afterwards.
 */
export function useMove(publicationId: () => string) {
  const queryClient = useQueryClient()
  /** What the last move did, and whether it can be undone (not when items were joined: that can't be unpicked). */
  const outcome = ref<{ text: string; undo: (() => void) | null } | null>(null)

  const refresh = () => invalidateRoots(queryClient, 'idea', 'ideas', 'reading', 'notes')

  /**
   * Undo asks the publication the things went to (`via`, when that was another) to send them back to where they were.
   * It works for someone who still belongs to both.
   */
  const back = (via: string | undefined, ideaId: string | null): MoveTarget =>
    via ? { ideaId, publicationId: publicationId() } : { ideaId }

  const undoMove = useMutation({
    mutationFn: ({ ids, ideaId, via }: { ids: string[]; ideaId: string | null; via?: string }) =>
      api.moveReadingItems(via ?? publicationId(), ids, back(via, ideaId)),
    onSuccess: () => {
      outcome.value = { text: 'Moved back.', undo: null }
    },
    onSettled: refresh,
  })

  /** `from` is where the items are now (an idea, or null for the publication's list); `to` names where they go. */
  const moveReading = useMutation({
    mutationFn: (v: MoveRequest) => api.moveReadingItems(publicationId(), v.ids, targetOf(v)),
    onSuccess: (result, v) => {
      outcome.value = {
        text: moveSummary(result, v.toName),
        undo: result.merged
          ? null
          : () => undoMove.mutate({ ids: v.ids, ideaId: v.from, via: v.toPublicationId }),
      }
    },
    onSettled: refresh,
  })

  const undoNotes = useMutation({
    mutationFn: ({
      ids,
      ideaId,
      via,
    }: {
      ids: string[]
      ideaId: string | null
      via?: string
      note: string
    }) => api.moveNotes(via ?? publicationId(), ids, back(via, ideaId)),
    onSuccess: (_, v) => {
      outcome.value = { text: `Moved back.${v.note}`, undo: null }
    },
    onSettled: refresh,
  })

  /**
   * Notes move to the end of where they go, each with its source copied there (the originals stay). Undo moves the
   * notes back (to the end of where they were); the copied sources stay where they were put.
   */
  const moveNotes = useMutation({
    mutationFn: (v: MoveRequest) => api.moveNotes(publicationId(), v.ids, targetOf(v)),
    onSuccess: (result, v) => {
      const note = result.copied
        ? result.copied === 1
          ? ` The page copied to ${v.toName} stays on its reading list.`
          : ` The ${result.copied} pages copied to ${v.toName} stay on its reading list.`
        : ''
      outcome.value = {
        text: moveSummary(result, v.toName),
        undo: () => undoNotes.mutate({ ids: v.ids, ideaId: v.from, via: v.toPublicationId, note }),
      }
    },
    onSettled: refresh,
  })

  return {
    outcome,
    moveReading,
    undoMove,
    moveNotes,
    undoNotes,
    dismiss: () => (outcome.value = null),
  }
}

export const NEW_IDEA = '__new'
/** The first choice that leads to a second one: a publication, then somewhere in it. */
export const OTHER_PUBLICATION = '__other'

/**
 * Where to move to: the publication's own list (when moving from an idea), one of the other ideas, a new idea named
 * in the writer's own words, or, for someone with more than one publication, somewhere in another of theirs (a
 * publication first, then its own list, one of its ideas or a new idea). `publicationName` is how the publication's
 * own list is called in the message ("the publication's reading list", "the publication's notes"). Returned reactive,
 * so it can be handed to `MoveTo` and read in templates without `.value`.
 */
export function useMoveDestination(
  publicationId: () => string,
  currentIdeaId: () => string | null,
  publicationName: string,
) {
  const ideas = useIdeas(publicationId)
  const publications = usePublications()
  const destination = ref('') // 'publication', an idea's id, NEW_IDEA or OTHER_PUBLICATION
  const newIdeaName = ref('')
  const otherPublicationId = ref('') // when destination is OTHER_PUBLICATION
  const otherDestination = ref('') // 'publication', an idea's id or NEW_IDEA, in that publication
  const others = computed(() => (ideas.data.value ?? []).filter((i) => i.id !== currentIdeaId()))
  /** The person's other publications; none (so no way in) for someone with only this one. */
  const otherPublications = computed(() =>
    (publications.data.value ?? []).filter((p) => p.id !== publicationId()),
  )
  const crossing = computed(() => destination.value === OTHER_PUBLICATION)
  const otherPublication = computed(() =>
    otherPublications.value.find((p) => p.id === otherPublicationId.value),
  )
  // Only asked for once there is a publication to ask about.
  const otherIdeas = useIdeas(
    () => otherPublicationId.value,
    () => !!otherPublicationId.value,
  )
  /** The choice within the destination publication, wherever that is. */
  const choice = computed(() => (crossing.value ? otherDestination.value : destination.value))
  /** The other publication's own list, worded like the current one's ("“Poems”’s reading list"). */
  const otherListLabel = computed(() =>
    publicationName.replace(/^the publication’s/i, `“${otherPublication.value?.name ?? ''}”’s`),
  )
  const name = computed(() => {
    if (crossing.value && !otherPublication.value) return ''
    const pub = crossing.value ? otherPublication.value!.name : ''
    const within = (text: string) => (crossing.value ? `${text} in “${pub}”` : text)
    if (choice.value === 'publication') {
      return crossing.value ? otherListLabel.value : publicationName
    }
    if (choice.value === NEW_IDEA) return within(`“${newIdeaName.value.trim()}”`)
    const list = crossing.value ? otherIdeas.data.value : ideas.data.value
    const idea = list?.find((i) => i.id === choice.value)
    return idea ? within(`“${idea.name}”`) : ''
  })
  // A new idea is made first; if the move then fails it stays, empty, as any idea.
  const makeIdea = useMutation({
    mutationFn: () =>
      api.createIdea(crossing.value ? otherPublicationId.value : publicationId(), {
        name: newIdeaName.value.trim(),
      }),
  })
  const chosen = computed(
    () =>
      (!crossing.value || (!!otherPublicationId.value && !!otherDestination.value)) &&
      !!choice.value &&
      (choice.value !== NEW_IDEA || !!newIdeaName.value.trim()) &&
      !!destination.value,
  )
  /**
   * The idea to move to (null: the publication's own list), the publication when it is another, and how to word it;
   * the new idea is made first, and a null result means that failed.
   */
  async function resolve(): Promise<{
    to: string | null
    toPublicationId?: string
    name: string
  } | null> {
    const label = name.value
    const toPublicationId = crossing.value ? otherPublicationId.value : undefined
    if (choice.value === NEW_IDEA) {
      const idea = await makeIdea.mutateAsync().catch(() => null)
      return idea ? { to: idea.id, toPublicationId, name: label } : null
    }
    return {
      to: choice.value === 'publication' ? null : choice.value,
      toPublicationId,
      name: label,
    }
  }
  function reset() {
    destination.value = ''
    newIdeaName.value = ''
    otherPublicationId.value = ''
    otherDestination.value = ''
    makeIdea.reset()
  }
  return reactive({
    ideas,
    publications,
    destination,
    newIdeaName,
    otherPublicationId,
    otherDestination,
    otherPublications,
    otherIdeas,
    otherPublication,
    otherListLabel,
    crossing,
    others,
    name,
    makeIdea,
    chosen,
    resolve,
    reset,
  })
}

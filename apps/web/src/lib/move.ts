import { useMutation, useQueryClient } from '@tanstack/vue-query'
import type { MoveResult } from '@wordwright/core'
import { computed, reactive, ref } from 'vue'
import { api } from './api'
import { invalidateRoots, useIdeas } from './queries'

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

/**
 * Moving reading items (and, later, notes) between the publication's own lists and its ideas, saying what happened
 * and, where it can, offering to put it back. Everything that shows a list is refreshed afterwards.
 */
export function useMove(publicationId: () => string) {
  const queryClient = useQueryClient()
  /** What the last move did, and whether it can be undone (not when items were joined: that can't be unpicked). */
  const outcome = ref<{ text: string; undo: (() => void) | null } | null>(null)

  const refresh = () => invalidateRoots(queryClient, 'idea', 'ideas', 'reading', 'notes')

  const undoMove = useMutation({
    mutationFn: ({ ids, ideaId }: { ids: string[]; ideaId: string | null }) =>
      api.moveReadingItems(publicationId(), ids, ideaId),
    onSuccess: () => {
      outcome.value = { text: 'Moved back.', undo: null }
    },
    onSettled: refresh,
  })

  /** `from` is where the items are now (an idea, or null for the publication's list); `to` names where they go. */
  const moveReading = useMutation({
    mutationFn: (v: { ids: string[]; from: string | null; to: string | null; toName: string }) =>
      api.moveReadingItems(publicationId(), v.ids, v.to),
    onSuccess: (result, v) => {
      outcome.value = {
        text: moveSummary(result, v.toName),
        undo: result.merged ? null : () => undoMove.mutate({ ids: v.ids, ideaId: v.from }),
      }
    },
    onSettled: refresh,
  })

  const undoNotes = useMutation({
    mutationFn: ({ ids, ideaId }: { ids: string[]; ideaId: string | null; note: string }) =>
      api.moveNotes(publicationId(), ids, ideaId),
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
    mutationFn: (v: { ids: string[]; from: string | null; to: string | null; toName: string }) =>
      api.moveNotes(publicationId(), v.ids, v.to),
    onSuccess: (result, v) => {
      const note = result.copied
        ? result.copied === 1
          ? ` The page copied to ${v.toName} stays on its reading list.`
          : ` The ${result.copied} pages copied to ${v.toName} stay on its reading list.`
        : ''
      outcome.value = {
        text: moveSummary(result, v.toName),
        undo: () => undoNotes.mutate({ ids: v.ids, ideaId: v.from, note }),
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

/**
 * Where to move to: the publication's own list (when moving from an idea), one of the other ideas, or a new idea named
 * in the writer's own words (nothing prefilled). `publicationName` is how the publication's own list is called in the
 * message ("the publication's reading list", "the publication's notes"). Returned reactive, so it can be handed to
 * `MoveTo` and read in templates without `.value`.
 */
export function useMoveDestination(
  publicationId: () => string,
  currentIdeaId: () => string | null,
  publicationName: string,
) {
  const ideas = useIdeas(publicationId)
  const destination = ref('') // 'publication', an idea's id, or NEW_IDEA
  const newIdeaName = ref('')
  const others = computed(() => (ideas.data.value ?? []).filter((i) => i.id !== currentIdeaId()))
  const name = computed(() => {
    if (destination.value === 'publication') return publicationName
    if (destination.value === NEW_IDEA) return `“${newIdeaName.value.trim()}”`
    const idea = ideas.data.value?.find((i) => i.id === destination.value)
    return idea ? `“${idea.name}”` : ''
  })
  // A new idea is made first; if the move then fails it stays, empty, as any idea.
  const makeIdea = useMutation({
    mutationFn: () => api.createIdea(publicationId(), { name: newIdeaName.value.trim() }),
  })
  const chosen = computed(
    () => !!destination.value && (destination.value !== NEW_IDEA || !!newIdeaName.value.trim()),
  )
  /** The idea to move to (null: the publication's own list), making the new idea first; null result if that failed. */
  async function resolve(): Promise<{ to: string | null; name: string } | null> {
    const label = name.value
    if (destination.value === NEW_IDEA) {
      const idea = await makeIdea.mutateAsync().catch(() => null)
      return idea ? { to: idea.id, name: label } : null
    }
    return { to: destination.value === 'publication' ? null : destination.value, name: label }
  }
  function reset() {
    destination.value = ''
    newIdeaName.value = ''
    makeIdea.reset()
  }
  return reactive({
    ideas,
    destination,
    newIdeaName,
    others,
    name,
    makeIdea,
    chosen,
    resolve,
    reset,
  })
}

import { useMutation, useQueryClient } from '@tanstack/vue-query'
import type { MoveResult } from '@lfwa/core'
import { ref } from 'vue'
import { api } from './api'

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
 * Moving reading items (and, later, notes) between the profile's own lists and its ideas, saying what happened
 * and, where it can, offering to put it back. Everything that shows a list is refreshed afterwards.
 */
export function useMove(profileId: () => string) {
  const queryClient = useQueryClient()
  /** What the last move did, and whether it can be undone (not when items were joined: that can't be unpicked). */
  const outcome = ref<{ text: string; undo: (() => void) | null } | null>(null)

  const refresh = () =>
    Promise.all(
      ['idea', 'ideas', 'reading', 'notes'].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key] }),
      ),
    )

  const undoMove = useMutation({
    mutationFn: ({ ids, ideaId }: { ids: string[]; ideaId: string | null }) =>
      api.moveReadingItems(profileId(), ids, ideaId),
    onSuccess: () => {
      outcome.value = { text: 'Moved back.', undo: null }
    },
    onSettled: refresh,
  })

  /** `from` is where the items are now (an idea, or null for the profile's list); `to` names where they go. */
  const moveReading = useMutation({
    mutationFn: (v: { ids: string[]; from: string | null; to: string | null; toName: string }) =>
      api.moveReadingItems(profileId(), v.ids, v.to),
    onSuccess: (result, v) => {
      outcome.value = {
        text: moveSummary(result, v.toName),
        undo: result.merged ? null : () => undoMove.mutate({ ids: v.ids, ideaId: v.from }),
      }
    },
    onSettled: refresh,
  })

  return { outcome, moveReading, undoMove, dismiss: () => (outcome.value = null) }
}

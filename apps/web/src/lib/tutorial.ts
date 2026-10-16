import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/vue-query'
import type { TutorialUpdate } from '@wordwright/core'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSessionStore } from '../stores/session'
import { api } from './api'
import { queryKeys } from './queries'

/** Whether tutorial mode is on for the person signed in. It comes with the user, so every page knows at once. */
export function useTutorialMode() {
  const session = useSessionStore()
  return computed(() => session.user?.tutorialMode === true)
}

/** Which kinds of page they have seen and whether the offer to turn it off was answered. Only asked for while on. */
export function useTutorialState() {
  const on = useTutorialMode()
  return useQuery({ queryKey: queryKeys.tutorial(), queryFn: () => api.getTutorial(), enabled: on })
}

const inFlight = new Set<string>()

/**
 * Tells the server a kind of page (a route name) has been seen. Quiet when it fails: it only decides when the offer to
 * turn tutorial mode off appears, so the person has nothing to do about it, and the next visit tries again.
 */
export function recordSeen(queryClient: QueryClient, kind: string) {
  if (inFlight.has(kind)) return
  inFlight.add(kind)
  api
    .markTutorialSeen(kind)
    .then((state) => queryClient.setQueryData(queryKeys.tutorial(), state))
    .catch(() => {})
    .finally(() => inFlight.delete(kind))
}

/** The route name of the page, when it has opted in to tutorial mode (`meta.tutorial`). */
export function useTutorialKind() {
  const route = useRoute()
  return computed(() => (route.meta.tutorial && route.name ? String(route.name) : null))
}

/** Records the current page's kind once tutorial mode is on, we know what has been seen, and it hasn't been. */
export function useRecordKindSeen() {
  const queryClient = useQueryClient()
  const on = useTutorialMode()
  const state = useTutorialState()
  const kind = useTutorialKind()
  watch(
    [on, () => state.data.value, kind],
    () => {
      const seen = state.data.value?.seen
      if (on.value && kind.value && seen && !seen.includes(kind.value)) {
        recordSeen(queryClient, kind.value)
      }
    },
    { immediate: true },
  )
}

/**
 * Whether to offer turning tutorial mode off: it is on, the offer hasn't been answered, there are pages with tutorial
 * text and every one has been seen. It is judged when a page is opened, from what had been seen *before* it, so the
 * page that completes the set doesn't get the offer and the next one does. Not on a quiet page (the editor).
 */
export function useTutorialOffer() {
  const route = useRoute()
  const router = useRouter()
  const on = useTutorialMode()
  const state = useTutorialState()
  const kinds = computed(() =>
    router
      .getRoutes()
      .filter((r) => r.meta.tutorial && r.name)
      .map((r) => String(r.name)),
  )
  const seenOnArrival = ref<string[] | null>(null)
  watch(
    () => route.fullPath,
    () => (seenOnArrival.value = state.data.value?.seen ?? null),
    { immediate: true },
  )
  // The first load of the page: what was seen is only known once the server answers.
  watch(
    () => state.data.value,
    (data) => {
      if (seenOnArrival.value === null && data) seenOnArrival.value = data.seen
    },
  )
  return computed(
    () =>
      on.value &&
      !route.meta.quiet &&
      state.data.value?.answered === false &&
      kinds.value.length > 0 &&
      seenOnArrival.value !== null &&
      kinds.value.every((k) => seenOnArrival.value!.includes(k)),
  )
}

/** Changes the switch or answers the offer, and brings the session and the seen list up to date with the result. */
export function useUpdateTutorial() {
  const session = useSessionStore()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (update: TutorialUpdate) => api.updateTutorial(update),
    onSuccess: (state) => {
      queryClient.setQueryData(queryKeys.tutorial(), state)
      if (session.user) session.set({ ...session.user, tutorialMode: state.on })
    },
  })
}

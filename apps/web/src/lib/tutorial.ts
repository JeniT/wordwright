import { useMutation } from '@tanstack/vue-query'
import type { TutorialUpdate } from '@wordwright/core'
import { computed } from 'vue'
import { useSessionStore } from '../stores/session'
import { api } from './api'

/** Whether tutorial mode is on for the person signed in. It comes with the user, so every page knows at once. */
export function useTutorialMode() {
  const session = useSessionStore()
  return computed(() => session.user?.tutorialMode === true)
}

/**
 * Changes the switch. The session is updated at once, so the explanations on the page change with it, and put back
 * if the server refuses.
 */
export function useUpdateTutorial() {
  const session = useSessionStore()
  return useMutation({
    mutationFn: (update: TutorialUpdate) => api.updateTutorial(update),
    onMutate: (update) => {
      const before = session.user?.tutorialMode ?? false
      if (session.user) session.set({ ...session.user, tutorialMode: update.on })
      return { before }
    },
    onError: (_error, _update, context) => {
      if (session.user && context) session.set({ ...session.user, tutorialMode: context.before })
    },
  })
}

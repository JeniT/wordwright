<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import type { TutorialUpdate } from '@wordwright/core'
import { api, errorMessage } from '../lib/api'
import { queryKeys } from '../lib/queries'
import { useTutorialOffer } from '../lib/tutorial'
import { useSessionStore } from '../stores/session'

/** The one-time offer to turn tutorial mode off, once every page with tutorial text has been seen (#198). */
const show = useTutorialOffer()
const session = useSessionStore()
const queryClient = useQueryClient()
const answer = useMutation({
  mutationFn: (update: TutorialUpdate) => api.updateTutorial(update),
  onSuccess: (state) => {
    queryClient.setQueryData(queryKeys.tutorial(), state)
    if (session.user) session.set({ ...session.user, tutorialMode: state.on })
  },
})
</script>

<template>
  <section v-if="show" class="notice notice-info" aria-label="Tutorial mode">
    <h2 class="font-semibold">You’ve seen every kind of page</h2>
    <p class="mt-1 text-ink-soft">
      Tutorial mode explains each page as you go. You can turn it off now, or on again later in your
      account settings.
    </p>
    <div class="mt-3 flex flex-wrap items-center gap-2">
      <button
        type="button"
        class="btn btn-primary btn-sm"
        :disabled="answer.isPending.value"
        @click="answer.mutate({ on: false, answered: true })"
      >
        Turn off tutorial mode
      </button>
      <button
        type="button"
        class="btn btn-quiet btn-sm"
        :disabled="answer.isPending.value"
        @click="answer.mutate({ answered: true })"
      >
        Keep it on
      </button>
    </div>
    <p v-if="answer.isError.value" role="alert" class="mt-2 text-danger">
      {{ errorMessage(answer.error.value) }}
    </p>
  </section>
</template>

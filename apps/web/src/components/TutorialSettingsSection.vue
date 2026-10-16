<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { useTemplateRef } from 'vue'
import { api } from '../lib/api'
import { queryKeys } from '../lib/queries'
import { useTutorialMode } from '../lib/tutorial'
import { useSessionStore } from '../stores/session'
import SaveStatus from './SaveStatus.vue'
import SwitchField from './SwitchField.vue'

const session = useSessionStore()
const queryClient = useQueryClient()
const on = useTutorialMode()
const field = useTemplateRef<InstanceType<typeof SwitchField>>('field')
const save = useMutation({
  mutationFn: (value: boolean) => api.updateTutorial({ on: value }),
  onSuccess: (state) => {
    queryClient.setQueryData(queryKeys.tutorial(), state)
    if (session.user) session.set({ ...session.user, tutorialMode: state.on })
  },
  onError: () => field.value?.revert(),
})
</script>

<template>
  <section aria-labelledby="tutorial-heading" aria-label="Tutorial mode">
    <h2 id="tutorial-heading" class="mb-1 font-display text-xl font-semibold">Tutorial mode</h2>
    <p class="mb-3 text-sm text-ink-soft">
      Writes out, on the page, the explanations that otherwise sit behind an info icon, and what
      each page is for. It is on for new accounts, and you can turn it on or off here whenever you
      like.
    </p>
    <SwitchField
      ref="field"
      :model-value="on"
      label="Tutorial mode"
      @update:model-value="save.mutate($event)"
    />
    <SaveStatus :mutation="save" class="mt-2" />
  </section>
</template>

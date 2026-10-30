<script setup lang="ts">
import { CRITIQUE_ROUNDS_DEFAULT, CRITIQUE_ROUNDS_MAX, CRITIQUE_ROUNDS_MIN } from '@wordwright/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed } from 'vue'
import { api, errorMessage } from '../lib/api'
import InfoTip from './InfoTip.vue'
import SaveStatus from './SaveStatus.vue'
import { useSavedValue } from '../lib/forms'
import { queryKeys } from '../lib/queries'

const queryClient = useQueryClient()
const settings = useQuery({
  queryKey: queryKeys.critiqueSettings(),
  queryFn: () => api.getCritiqueSettings(),
})
// A valid default, so the form can never submit nothing before the setting arrives.
const rounds = useSavedValue(() => settings.data.value?.rounds, CRITIQUE_ROUNDS_DEFAULT)
const choices = Array.from(
  { length: CRITIQUE_ROUNDS_MAX - CRITIQUE_ROUNDS_MIN + 1 },
  (_, i) => CRITIQUE_ROUNDS_MIN + i,
)
const unsaved = computed(() => rounds.value !== settings.data.value?.rounds)
const save = useMutation({
  mutationFn: () => api.saveCritiqueSettings(rounds.value),
  onSuccess: (saved) => queryClient.setQueryData(queryKeys.critiqueSettings(), saved),
})
</script>

<template>
  <section aria-labelledby="critique-settings-heading">
    <div class="mb-3 flex items-center gap-2">
      <h2 id="critique-settings-heading" class="font-display text-xl font-semibold">
        Critique limit
      </h2>
      <InfoTip label="Why critiques are limited"
        >Your AI will always find more to change and each critique can take a draft further from
        your voice. You can always get other people to review your drafts as well.</InfoTip
      >
    </div>
    <p v-if="settings.isError.value" role="alert" class="mb-3 text-danger">
      {{ errorMessage(settings.error.value) }}
    </p>
    <p class="mb-3 text-sm text-ink-soft">
      Your AI can critique your draft and give you comments on it. This is how many times you can
      ask your AI for a critique.
    </p>
    <form @submit.prevent="save.mutate()">
      <div class="mb-4">
        <label for="critique-rounds" class="mb-1 block text-sm font-medium"
          >Critiques per draft</label
        >
        <select
          id="critique-rounds"
          v-model.number="rounds"
          class="field"
          aria-describedby="critique-rounds-hint"
          :disabled="!settings.data.value"
        >
          <option v-for="n in choices" :key="n" :value="n">
            {{ n }}{{ n === CRITIQUE_ROUNDS_DEFAULT ? ' (suggested)' : '' }}
          </option>
        </select>
        <p id="critique-rounds-hint" class="mt-1 text-sm text-ink-soft">
          This also limits how many times you can ask for options for ways to rephrase parts of your
          drafts.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          class="btn btn-primary"
          :disabled="save.isPending.value || !settings.data.value || !unsaved"
        >
          {{ save.isPending.value ? 'Saving…' : 'Save limit' }}
        </button>
        <SaveStatus :mutation="save" :unsaved="unsaved" class="basis-full" />
      </div>
    </form>
  </section>
</template>

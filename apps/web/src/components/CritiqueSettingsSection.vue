<script setup lang="ts">
import { CRITIQUE_ROUNDS_DEFAULT, CRITIQUE_ROUNDS_MAX, CRITIQUE_ROUNDS_MIN } from '@wordwright/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { api, errorMessage } from '../lib/api'
import InfoTip from './InfoTip.vue'
import SaveStatus from './SaveStatus.vue'
import { useSavedValue } from '../lib/forms'

const queryClient = useQueryClient()
const settings = useQuery({
  queryKey: ['critique-settings'],
  queryFn: () => api.getCritiqueSettings(),
})
// A valid default, so the form can never submit nothing before the setting arrives.
const rounds = useSavedValue(() => settings.data.value?.rounds, CRITIQUE_ROUNDS_DEFAULT)
const choices = Array.from(
  { length: CRITIQUE_ROUNDS_MAX - CRITIQUE_ROUNDS_MIN + 1 },
  (_, i) => CRITIQUE_ROUNDS_MIN + i,
)
const save = useMutation({
  mutationFn: () => api.saveCritiqueSettings(rounds.value),
  onSuccess: (saved) => queryClient.setQueryData(['critique-settings'], saved),
})
</script>

<template>
  <section aria-labelledby="critique-settings-heading">
    <div class="mb-3 flex items-center gap-2">
      <h2 id="critique-settings-heading" class="font-display text-xl font-semibold">
        Critique limit
      </h2>
      <InfoTip label="Why critiques are limited"
        >An AI editor can always find more to change, and each round can take a draft further from
        your voice. When a draft's critiques are used up, the next step is to publish.</InfoTip
      >
    </div>
    <p v-if="settings.isError.value" role="alert" class="mb-3 text-danger">
      {{ errorMessage(settings.error.value) }}
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
          Also limits how many times you can ask for options for ways to rephrase parts of your
          drafts.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          class="btn btn-primary"
          :disabled="save.isPending.value || !settings.data.value"
        >
          Save limit
        </button>
        <SaveStatus :mutation="save" class="basis-full" />
      </div>
    </form>
  </section>
</template>

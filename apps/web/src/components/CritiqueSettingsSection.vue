<script setup lang="ts">
import { CRITIQUE_ROUNDS_DEFAULT, CRITIQUE_ROUNDS_MAX, CRITIQUE_ROUNDS_MIN } from '@lfwa/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { ref, watch } from 'vue'
import { api, errorMessage } from '../lib/api'

const queryClient = useQueryClient()
const settings = useQuery({
  queryKey: ['critique-settings'],
  queryFn: () => api.getCritiqueSettings(),
})
// A valid default, so the form can never submit nothing before the setting arrives.
const rounds = ref(CRITIQUE_ROUNDS_DEFAULT)
watch(
  () => settings.data.value,
  (saved) => {
    if (saved) rounds.value = saved.rounds
  },
  { immediate: true },
)
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
    <h2 id="critique-settings-heading" class="mb-1 font-display text-xl font-semibold">
      Critiques of a draft
    </h2>
    <p class="mb-3 text-sm text-ink-soft">
      An AI editor can always find something else to change, and each round of changes can take a
      draft further from your own voice and further from finished. So a draft gets a limited number
      of critiques. The count is kept for the draft, and editing it doesn't reset it. When they are
      used up, the next step is to publish.
    </p>
    <p v-if="settings.isError.value" role="alert" class="mb-3 text-danger">
      {{ errorMessage(settings.error.value) }}
    </p>
    <form @submit.prevent="save.mutate()">
      <div class="mb-4">
        <label for="critique-rounds" class="mb-1 block text-sm font-medium"
          >Critiques each draft gets</label
        >
        <select id="critique-rounds" v-model.number="rounds" class="field">
          <option v-for="n in choices" :key="n" :value="n">
            {{ n }}{{ n === CRITIQUE_ROUNDS_DEFAULT ? ' (suggested)' : '' }}
          </option>
        </select>
      </div>
      <p v-if="save.isError.value" role="alert" class="mb-3 text-danger">
        {{ errorMessage(save.error.value) }}
      </p>
      <div class="flex items-center gap-3">
        <button
          type="submit"
          class="btn btn-primary"
          :disabled="save.isPending.value || !settings.data.value"
        >
          Save
        </button>
        <p v-if="save.isSuccess.value" role="status" class="text-sm text-ink-soft">Saved</p>
      </div>
    </form>
  </section>
</template>

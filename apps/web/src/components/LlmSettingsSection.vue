<script setup lang="ts">
import { DEFAULT_LLM_MODEL, LLM_MODELS } from '@wordwright/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { api } from '../lib/api'
import HoldButton from './HoldButton.vue'
import Icon from './Icon.vue'
import ProviderPrivacyAdvice from './ProviderPrivacyAdvice.vue'
import TextField from './TextField.vue'
import SaveStatus from './SaveStatus.vue'
import { useSavedValue } from '../lib/forms'

const props = defineProps<{
  /** First-time setup: step-by-step instructions, and just the key field (the default model is used). */
  guide?: boolean
}>()
const emit = defineEmits<{ saved: [] }>()

const queryClient = useQueryClient()
const llm = useQuery({ queryKey: ['llm'], queryFn: () => api.getLlmSettings() })
// A valid default, so the form can never submit an empty model before settings arrive.
const model = useSavedValue<string>(() => llm.data.value?.model, DEFAULT_LLM_MODEL.anthropic)
const apiKey = ref('')
const saveLlm = useMutation({
  mutationFn: () =>
    api.saveLlmSettings({
      provider: 'anthropic',
      model: model.value,
      apiKey: apiKey.value.trim() || undefined,
    }),
  onSuccess: (settings) => {
    apiKey.value = ''
    queryClient.setQueryData(['llm'], settings)
    emit('saved')
  },
})
const removeLlmKey = useMutation({
  mutationFn: () => api.removeLlmKey(),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['llm'] }),
})
</script>

<template>
  <section aria-labelledby="llm-heading">
    <!-- In the guide it is a step inside the first-run checklist (an h2 section), so one level down. -->
    <component
      :is="props.guide ? 'h3' : 'h2'"
      id="llm-heading"
      :class="[props.guide ? 'text-lg' : 'text-xl', 'mb-1 font-display font-semibold']"
    >
      {{ props.guide ? 'Connect your AI key (Anthropic)' : 'AI assistant' }}
    </component>
    <template v-if="props.guide">
      <p class="mb-3">
        <RouterLink to="/help/api-key" target="_blank" class="link"
          >How to get an API key (opens in a new tab)</RouterLink
        >
      </p>
      <p class="mb-3">
        AI functions use Anthropic, which will bill you for your use.
        <RouterLink to="/help/privacy" target="_blank" class="link"
          >Read the privacy advice (opens in a new tab)</RouterLink
        >
      </p>
    </template>
    <p v-else class="mb-3 text-sm text-ink-soft">
      AI features use your own Anthropic account, so usage is billed to you, not to this service.
      Paste your key below. It’s stored encrypted and never shown again.
      <RouterLink to="/help/api-key" target="_blank" class="link"
        >How to get an API key (opens in a new tab)</RouterLink
      >
    </p>
    <p v-if="!props.guide" class="mb-3 text-sm text-ink-soft">
      <Icon name="ai" :size="16" class="mr-1 inline align-text-bottom" />
      A button with this mark sends your text to your AI and uses your key, so it costs tokens;
      while it works, the mark turns into a spinner. Buttons without the mark never do.
    </p>
    <ProviderPrivacyAdvice v-if="!props.guide" />
    <p v-if="llm.data.value && !props.guide" role="status" class="mb-3 text-sm">
      <template v-if="llm.data.value.hasKey"
        >Anthropic key saved ({{ llm.data.value.keyHint }}).</template
      >
      <template v-else>No API key yet.</template>
    </p>
    <form @submit.prevent="saveLlm.mutate()">
      <div v-if="!props.guide" class="mb-4">
        <label for="llm-model" class="mb-1 block text-sm font-medium">Model</label>
        <select id="llm-model" v-model="model" class="field">
          <option v-for="m in LLM_MODELS.anthropic" :key="m.id" :value="m.id">
            {{ m.label }}
          </option>
        </select>
      </div>
      <TextField
        v-model="apiKey"
        :label="
          llm.data.value?.hasKey
            ? 'Replace API key (leave blank to keep the current one)'
            : 'Anthropic API key'
        "
        type="password"
        autocomplete="off"
        :required="!llm.data.value?.hasKey"
      />
      <div class="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          class="btn btn-primary"
          :disabled="saveLlm.isPending.value || llm.isPending.value"
        >
          {{ saveLlm.isPending.value ? 'Checking key…' : 'Save' }}
        </button>
        <HoldButton
          v-if="llm.data.value?.hasKey"
          tip="Press and hold, or tap twice, to remove your key"
          verb="Remove"
          class="btn btn-sm btn-icon btn-ghost btn-ghost-danger"
          aria-label="Remove key"
          :disabled="removeLlmKey.isPending.value"
          @confirm="removeLlmKey.mutate()"
        >
          <Icon name="remove" />
        </HoldButton>
        <SaveStatus :mutation="[saveLlm, removeLlmKey]" saved="Saved" class="basis-full" />
      </div>
    </form>
  </section>
</template>

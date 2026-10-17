<script setup lang="ts">
import NewTabLink from './NewTabLink.vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { api } from '../lib/api'
import Explain from './Explain.vue'
import HoldButton from './HoldButton.vue'
import Icon from './Icon.vue'
import InfoTip from './InfoTip.vue'
import TextField from './TextField.vue'
import SaveStatus from './SaveStatus.vue'
import { useSavedValue } from '../lib/forms'
import { queryKeys, useLlmModels } from '../lib/queries'

const props = defineProps<{
  /** First-time setup: step-by-step instructions, and just the key field (the default model is used). */
  guide?: boolean
}>()
const emit = defineEmits<{ saved: [] }>()

const queryClient = useQueryClient()
const llm = useQuery({ queryKey: queryKeys.llm(), queryFn: () => api.getLlmSettings() })
// The provider lists the models for a key, so the choice only exists once there is one.
const hasKey = computed(() => !props.guide && llm.data.value?.hasKey === true)
const models = useLlmModels(() => hasKey.value)
const model = useSavedValue<string>(() => llm.data.value?.model, '')
const offered = computed(() => models.data.value?.models ?? [])
const retired = computed(
  () => models.isSuccess.value && !!model.value && !offered.value.some((m) => m.id === model.value),
)
const apiKey = ref('')
// The saved key as the provider's console shows it, in the empty field: it goes as soon as a new one is typed.
const currentKey = computed(() => (props.guide ? null : (llm.data.value?.keyHint ?? null)))
const saveLlm = useMutation({
  mutationFn: () =>
    api.saveLlmSettings({
      provider: 'anthropic',
      // Left out until there is a list to choose from: the server keeps the current model, or picks one.
      // A retired model is not sent either: the server would refuse it, and keeps or replaces it itself.
      model:
        hasKey.value && models.isSuccess.value && model.value && !retired.value
          ? model.value
          : undefined,
      apiKey: apiKey.value.trim() || undefined,
    }),
  onSuccess: (settings) => {
    apiKey.value = ''
    queryClient.setQueryData(queryKeys.llm(), settings)
    queryClient.invalidateQueries({ queryKey: queryKeys.llmModels() })
    emit('saved')
  },
})
const removeLlmKey = useMutation({
  mutationFn: () => api.removeLlmKey(),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.llm() })
    queryClient.removeQueries({ queryKey: queryKeys.llmModels() })
  },
})
</script>

<template>
  <section aria-labelledby="llm-heading">
    <!-- In the guide it is a step inside the first-run checklist (an h2 section), so one level down. -->
    <!-- The guide's explanation sits with the heading: an icon beside it, or written out below it in tutorial mode. -->
    <div class="mb-1 flex flex-wrap items-center gap-2">
      <component
        :is="props.guide ? 'h3' : 'h2'"
        id="llm-heading"
        :class="[props.guide ? 'text-lg' : 'text-xl', 'font-display font-semibold']"
      >
        {{ props.guide ? 'Connect your AI key (Anthropic)' : 'Your AI key' }}
      </component>
      <InfoTip v-if="!props.guide" label="About your AI key"
        >What the AI mark means is explained in
        <RouterLink to="/help/ai-settings" class="link">Your AI settings</RouterLink>.</InfoTip
      >
      <Explain v-if="props.guide" label="About your AI key">
        Wordwright has no AI of its own: you connect yours. Buttons with the AI mark send your text
        to it, and nothing else does.
      </Explain>
    </div>
    <template v-if="props.guide">
      <p class="mb-3">
        <NewTabLink to="/help/api-key" class="link">How to get an API key</NewTabLink>
      </p>
      <p class="mb-3">
        AI functions use Anthropic, which will bill you for your use.
        <NewTabLink to="/help/privacy" class="link">Read the privacy advice</NewTabLink>
      </p>
    </template>
    <template v-else>
      <p class="mb-1">Your AI uses your own Anthropic key, so Anthropic bills you, not us.</p>
      <p class="mb-3 flex flex-wrap gap-x-4 text-sm">
        <NewTabLink to="/help/api-key" class="link">How to get an API key</NewTabLink>
        <NewTabLink to="/help/privacy" class="link">Privacy advice</NewTabLink>
      </p>
    </template>
    <form @submit.prevent="saveLlm.mutate()">
      <TextField
        v-model="apiKey"
        label="Anthropic API key"
        :placeholder="currentKey ?? 'sk-ant-...'"
        :hint="currentKey ? 'Leave as is to keep the current one' : undefined"
        type="password"
        autocomplete="off"
        :required="!llm.data.value?.hasKey"
      />
      <div v-if="hasKey" class="mb-4">
        <label v-if="models.isSuccess.value" for="llm-model" class="mb-1 block text-sm font-medium"
          >Model</label
        >
        <p v-else class="mb-1 text-sm font-medium">Model</p>
        <p v-if="models.isPending.value" class="text-ink-soft">Loading…</p>
        <template v-else-if="models.isError.value">
          <p>{{ model }}</p>
          <p role="alert" class="mt-1 text-danger">
            Couldn’t load models.
            <button type="button" class="link" @click="models.refetch()">Try again</button>
          </p>
        </template>
        <template v-else>
          <select id="llm-model" v-model="model" class="field">
            <option v-if="retired" :value="model">{{ model }}</option>
            <option v-for="m in offered" :key="m.id" :value="m.id">{{ m.label }}</option>
          </select>
          <p v-if="retired" role="alert" class="mt-1 text-danger">
            This model is no longer offered. Choose another.
          </p>
        </template>
      </div>
      <p v-else-if="!props.guide" class="mb-4 text-sm text-ink-soft">
        Save a key to choose a model.
      </p>
      <div class="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          class="btn btn-primary"
          :disabled="saveLlm.isPending.value || llm.isPending.value"
        >
          {{ saveLlm.isPending.value ? 'Checking key…' : props.guide ? 'Save' : 'Save key' }}
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

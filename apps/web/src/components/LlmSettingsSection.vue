<script setup lang="ts">
import { DEFAULT_LLM_MODEL, LLM_MODELS } from '@lfwa/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { ref } from 'vue'
import { api } from '../lib/api'
import HoldButton from './HoldButton.vue'
import Icon from './Icon.vue'
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
    <h2 id="llm-heading" class="mb-1 font-display text-xl font-semibold">
      {{ props.guide ? 'First, connect your AI assistant' : 'AI assistant' }}
    </h2>
    <template v-if="props.guide">
      <p class="mb-3 text-sm text-ink-soft">
        Wordwright uses your own Anthropic account to read and critique your drafts, so the cost of
        using it is billed to you, not to this service. You'll need to do this once before the
        assistant can help; it takes a few minutes.
      </p>
      <ol class="mb-4 list-decimal space-y-2 pl-5 text-sm text-ink-soft">
        <li>
          Go to the
          <a href="https://console.anthropic.com/" target="_blank" rel="noopener" class="underline"
            >Anthropic Console</a
          >
          and sign up or sign in. This is separate from a Claude chat subscription, so you may need
          a new account even if you already use Claude.
        </li>
        <li>
          Add a payment method and a small amount of credit in the Console's billing settings. A few
          dollars goes a long way, and you can set a monthly spending limit there too.
        </li>
        <li>
          Open
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noopener"
            class="underline"
            >API keys</a
          >
          and choose “Create key”. Give it a name you'll recognise, like “Writing assistant”.
        </li>
        <li>
          Copy the key straight away. The Console only shows it once, and it starts with
          <code class="rounded-ctl bg-sunken px-1">sk-ant-</code>.
        </li>
        <li>Paste it below and press Save. We check that it works before keeping it.</li>
      </ol>
      <p class="mb-3 text-sm text-ink-soft">
        Your key is stored encrypted, used only for your requests, and never shown again. You can
        replace or remove it any time from your account page.
      </p>
    </template>
    <p v-else class="mb-3 text-sm text-ink-soft">
      AI features use your own Anthropic account, so usage is billed to you, not to this service.
      Create a key in the
      <a
        href="https://console.anthropic.com/settings/keys"
        target="_blank"
        rel="noopener"
        class="underline"
        >Anthropic Console</a
      >
      and paste it below. It's stored encrypted and never shown again.
    </p>
    <p v-if="!props.guide" class="mb-3 text-sm text-ink-soft">
      <Icon name="ai" :size="16" class="mr-1 inline align-text-bottom" />
      A button with this mark sends your text to your AI and uses your key, so it costs tokens;
      while it works, the mark turns into a spinner. Buttons without the mark never do.
    </p>
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
          verb="Remove"
          class="btn btn-sm btn-icon btn-quiet hover:border-danger hover:bg-danger-wash hover:text-danger"
          title="Press and hold, or tap twice, to remove your key"
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

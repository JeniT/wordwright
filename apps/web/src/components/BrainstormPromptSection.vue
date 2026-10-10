<script setup lang="ts">
import { BRAINSTORM_PROMPT_MAX } from '@lfwa/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, ref, watch } from 'vue'
import { api, errorMessage } from '../lib/api'
import ConfirmDialog from './ConfirmDialog.vue'
import TextAreaField from './TextAreaField.vue'

const queryClient = useQueryClient()
const settings = useQuery({
  queryKey: ['brainstorm-prompt'],
  queryFn: () => api.getBrainstormPrompt(),
})

// What's in the box. It follows the saved prompt until the person starts typing.
const text = ref('')
watch(
  () => settings.data.value,
  (saved) => {
    if (saved) text.value = saved.prompt
  },
  { immediate: true },
)
const edited = computed(() => !!settings.data.value && text.value !== settings.data.value.prompt)
const isDefault = computed(() => settings.data.value?.isDefault ?? true)
const status = ref('')

const accept = (saved: Awaited<ReturnType<typeof api.getBrainstormPrompt>>, message: string) => {
  queryClient.setQueryData(['brainstorm-prompt'], saved)
  text.value = saved.prompt
  status.value = message
}

const save = useMutation({
  mutationFn: () => api.saveBrainstormPrompt(text.value),
  onMutate: () => (status.value = ''),
  onSuccess: (saved) =>
    accept(saved, saved.isDefault ? 'Saved. This is the default prompt.' : 'Saved.'),
})
const reset = useMutation({
  mutationFn: () => api.resetBrainstormPrompt(),
  onMutate: () => (status.value = ''),
  onSuccess: (saved) => accept(saved, 'Back to the default prompt.'),
  onSettled: () => (confirmingReset.value = false),
})

const confirmingReset = ref(false)
function startReset() {
  if (isDefault.value) {
    // Nothing saved to lose: just drop the unsaved edits.
    text.value = settings.data.value?.prompt ?? ''
    status.value = ''
    save.reset()
  } else {
    confirmingReset.value = true
  }
}

const hint = computed(
  () =>
    `${text.value.length.toLocaleString('en')} of ${BRAINSTORM_PROMPT_MAX.toLocaleString('en')} characters.`,
)
</script>

<template>
  <section aria-labelledby="brainstorm-prompt-heading">
    <h2 id="brainstorm-prompt-heading" class="mb-1 font-serif text-xl font-semibold">
      Brainstorming prompt
    </h2>
    <p class="mb-3 text-sm text-stone-700">
      When you brainstorm an idea, this tells the AI how to behave. By default it is a writing coach
      who helps you work out what you think and say it in your own voice, and who never writes your
      drafts. You can reword it to suit how you like to work. After it, the app always adds its own
      rules, for how its notes and suggestions work, when to stop, and to keep the AI from changing
      your work, so editing this can't break those.
    </p>

    <p v-if="settings.isPending.value">Loading…</p>
    <p v-else-if="settings.isError.value" role="alert" class="text-red-700">
      We couldn't load your brainstorming prompt. Try reloading the page.
    </p>
    <form v-else @submit.prevent="save.mutate()">
      <p class="mb-2 text-sm text-stone-700">
        {{
          isDefault
            ? 'You are using the default prompt.'
            : 'You are using your own version of the prompt.'
        }}
      </p>
      <TextAreaField
        v-model="text"
        label="Prompt"
        :rows="16"
        :maxlength="BRAINSTORM_PROMPT_MAX"
        :hint="hint"
      />
      <p v-if="save.isError.value || reset.isError.value" role="alert" class="mb-3 text-red-700">
        {{ errorMessage(save.error.value ?? reset.error.value) }}
      </p>
      <div class="flex flex-wrap items-center gap-3">
        <button type="submit" class="btn btn-primary" :disabled="save.isPending.value || !edited">
          {{ save.isPending.value ? 'Saving…' : 'Save' }}
        </button>
        <button
          type="button"
          class="rounded border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-50 disabled:opacity-60"
          :disabled="save.isPending.value || (isDefault && !edited)"
          @click="startReset"
        >
          Reset to default
        </button>
        <p role="status" class="text-sm text-stone-700">{{ status }}</p>
      </div>
    </form>

    <ConfirmDialog
      :open="confirmingReset"
      title="Go back to the default prompt?"
      confirm-label="Yes, reset it"
      busy-label="Resetting…"
      :busy="reset.isPending.value"
      @confirm="reset.mutate()"
      @cancel="confirmingReset = false"
    >
      Your own version of the prompt will be replaced by the default one. This can't be undone.
    </ConfirmDialog>
  </section>
</template>

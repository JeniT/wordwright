<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, ref, useId } from 'vue'
import { RouterLink } from 'vue-router'
import { RESEARCH_AREAS_MAX } from '@lfwa/core'
import { ApiError, api, errorMessage } from '../lib/api'
import { invalidateRoots } from '../lib/queries'
import AiButton from './AiButton.vue'

/**
 * The box for asking the AI to research an idea, shared by the Research page and the idea's landing page. Nothing
 * is sent until the button is pressed. `done` fires once the research has been saved, so the page can show it.
 */
const props = defineProps<{ publicationId: string; ideaId: string }>()
const emit = defineEmits<{ done: [] }>()
const queryClient = useQueryClient()
const fieldId = useId()

const areas = ref('')
const search = useMutation({
  mutationFn: (text: string) => api.runResearch(props.publicationId, props.ideaId, text),
  onSuccess: () => {
    areas.value = ''
    emit('done')
  },
  // Another member may have researched too, so read the whole list again.
  onSettled: () => invalidateRoots(queryClient, 'research'),
})
const needsKey = computed(() => {
  const err = search.error.value
  return err instanceof ApiError && err.status === 409 && /API key/i.test(err.message)
})
function submit() {
  const text = areas.value.trim()
  if (!text || search.isPending.value) return
  search.mutate(text)
}
</script>

<template>
  <form @submit.prevent="submit">
    <label :for="fieldId" class="mb-1 block text-sm font-medium">
      What areas do you want to research?
    </label>
    <textarea
      :id="fieldId"
      v-model="areas"
      rows="4"
      :maxlength="RESEARCH_AREAS_MAX"
      :disabled="search.isPending.value"
      :aria-describedby="`${fieldId}-hint`"
      class="field mb-2"
      @keydown.enter.ctrl.exact.prevent="submit"
      @keydown.enter.meta.exact.prevent="submit"
    ></textarea>
    <p :id="`${fieldId}-hint`" class="mb-2 text-sm text-ink-soft">
      For example: how fast river bends move, and what engineers have learned from straightening
      rivers. You can research other areas afterwards. Searching can take up to a minute.
    </p>
    <AiButton
      type="submit"
      class="btn btn-primary"
      :busy="search.isPending.value"
      busy-text="Searching the web. This can take up to a minute."
      :disabled="!areas.trim()"
    >
      Research
    </AiButton>
    <p v-if="search.isPending.value" class="mt-2 text-sm text-ink-soft">
      Searching the web. This can take up to a minute.
    </p>
    <div
      v-if="search.isError.value"
      role="alert"
      class="mt-3 rounded-ctl border border-danger bg-danger-wash p-3 text-danger"
    >
      <p>{{ errorMessage(search.error.value) }}</p>
      <p v-if="needsKey" class="mt-1">
        <RouterLink to="/account" class="underline">Go to account settings</RouterLink>
      </p>
    </div>
  </form>
</template>

<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { ref, useId } from 'vue'
import { RESEARCH_AREAS_MAX } from '@wordwright/core'
import { api, errorMessage } from '../lib/api'
import { keyProblemOf } from '../lib/key-problem'
import AiProblemAlert from './AiProblemAlert.vue'
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
      rivers.
    </p>
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <AiButton
        type="submit"
        class="btn btn-primary"
        :busy="search.isPending.value"
        busy-text="Searching the web. This can take up to a minute."
        :disabled="!areas.trim()"
      >
        Research
      </AiButton>
      <p class="min-w-0 flex-1 basis-64 text-sm text-ink-soft">
        This will send this publication’s description and this idea’s title and notes, reading list,
        and the areas you want to research to your AI. It will not send your drafts.
      </p>
    </div>
    <p v-if="search.isPending.value" class="mt-2 text-sm text-ink-soft">
      Searching the web. This can take up to a minute.
    </p>
    <AiProblemAlert
      v-if="search.isError.value"
      class="mt-3"
      :message="errorMessage(search.error.value)"
      :key-problem="keyProblemOf(search.error.value)"
    />
  </form>
</template>

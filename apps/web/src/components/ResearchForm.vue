<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { ref, useId } from 'vue'
import { RESEARCH_AREAS_MAX, type ResearchRun } from '@wordwright/core'
import { api, errorMessage } from '../lib/api'
import { keyProblemOf } from '../lib/key-problem'
import { invalidateRoots } from '../lib/queries'
import AiButton from './AiButton.vue'
import AiProblemAlert from './AiProblemAlert.vue'

/**
 * The box for asking the AI to research an idea, shared by the Research page and the idea's landing page. Nothing
 * is sent until the button is pressed. A sent search belongs to the server (#447): it is saved at once, waiting its
 * turn, and the page shows it with the idea's other research, so the box is cleared for the next question as soon as
 * the server has it. `sent` fires then, with the new run. If the server refuses it (the hourly limit, no key), the
 * words stay in the box and the reason is said under the button.
 */
const props = defineProps<{ publicationId: string; ideaId: string }>()
const emit = defineEmits<{ sent: [run: ResearchRun] }>()
const queryClient = useQueryClient()
const fieldId = useId()

const areas = ref('')
const send = useMutation({
  mutationFn: (text: string) => api.runResearch(props.publicationId, props.ideaId, text),
  onSuccess: async (run) => {
    areas.value = ''
    await invalidateRoots(queryClient, 'research')
    emit('sent', run)
  },
})
function submit() {
  const text = areas.value.trim()
  if (!text || send.isPending.value) return
  send.mutate(text)
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
        :busy="send.isPending.value"
        busy-text="Sending"
        :disabled="!areas.trim()"
      >
        Research
      </AiButton>
      <p class="min-w-0 flex-1 basis-64 text-sm text-ink-soft">
        This will send this publication’s description and this idea’s title and notes, articles, and
        the areas you want to research to your AI. It will not send your drafts.
      </p>
    </div>
    <AiProblemAlert
      v-if="send.isError.value"
      class="mt-3"
      :message="errorMessage(send.error.value)"
      :key-problem="keyProblemOf(send.error.value)"
    />
  </form>
</template>

<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, ref, watch } from 'vue'
import { api, errorMessage } from '../lib/api'
import { queryKeys } from '../lib/queries'
import { useHandover } from '../lib/draft-people'
import ModalDialog from './ModalDialog.vue'

/**
 * Sending the draft for review. The draft's title and body are frozen as a snapshot, and the people asked (by email, or
 * members of the publication) read and comment on that, not on later edits (ADR 0001). Only the editor sends. Who is
 * reviewing, and how far they have got, is the Reviews tab beside the draft (`ReviewsPanel`).
 */
const props = defineProps<{
  open: boolean
  publicationId: string
  draftId: string
  /** Saves the draft's latest words first; rejects (with why) if it can't. */
  prepare?: () => Promise<unknown>
}>()
const emit = defineEmits<{ close: [] }>()
const queryClient = useQueryClient()
const { others } = useHandover(
  () => props.publicationId,
  () => props.draftId,
)

const emails = ref('')
const chosen = ref<string[]>([])
watch(
  () => props.open,
  (open) => {
    if (open) send.reset()
  },
)
const addresses = computed(() => [...new Set(emails.value.split(/[\s,;]+/).filter(Boolean))])
const send = useMutation({
  // The snapshot is made from the saved draft, so the latest words are saved first.
  mutationFn: async () => {
    await props.prepare?.()
    return api.sendForReview(props.publicationId, props.draftId, {
      emails: addresses.value,
      memberIds: chosen.value,
    })
  },
  onSuccess: async () => {
    emails.value = ''
    chosen.value = []
    await queryClient.invalidateQueries({
      queryKey: queryKeys.reviewers(props.publicationId, props.draftId),
    })
    emit('close')
  },
})
</script>

<template>
  <ModalDialog :open="open" title="Send for review" :footer="false" @close="emit('close')">
    <form @submit.prevent="send.mutate()">
      <p class="callout mb-3" data-testid="snapshot-notice">
        Reviewers will read and comment on a snapshot of this draft as it is now.
      </p>
      <div class="mb-3">
        <label for="review-emails" class="mb-1 block font-medium">Email addresses</label>
        <textarea
          id="review-emails"
          v-model="emails"
          rows="2"
          class="field"
          autocomplete="off"
        ></textarea>
        <p class="mt-1 text-ink-soft">Separate addresses with commas or new lines.</p>
      </div>
      <fieldset v-if="others.length" class="mb-3">
        <legend class="mb-1 font-medium">Members of this publication</legend>
        <label v-for="m in others" :key="m.userId" class="mb-1 flex items-center gap-2">
          <input v-model="chosen" type="checkbox" :value="m.userId" class="size-4 accent-accent" />
          {{ m.name }}
        </label>
      </fieldset>
      <div class="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          class="btn btn-primary"
          :disabled="send.isPending.value || (!addresses.length && !chosen.length)"
        >
          Send for review
        </button>
        <button type="button" class="btn btn-neutral" @click="emit('close')">Cancel</button>
      </div>
      <p v-if="send.isError.value" role="alert" class="mt-3 text-danger">
        {{ errorMessage(send.error.value) }}
      </p>
    </form>
  </ModalDialog>
</template>

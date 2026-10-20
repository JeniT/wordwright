<script setup lang="ts">
import { ref, watch } from 'vue'
import { useHandover, useHandoverActions } from '../lib/draft-people'
import ModalDialog from './ModalDialog.vue'

/** An owner moves the editor role to another member without the current editor's involvement (CONTEXT.md, "Reassignment"). */
const props = defineProps<{
  open: boolean
  publicationId: string
  draftId: string
  /** Saves the draft's latest words first; rejects (with why) if it can't. */
  prepare?: () => Promise<unknown>
}>()
const emit = defineEmits<{ close: [] }>()
const { others } = useHandover(
  () => props.publicationId,
  () => props.draftId,
)
const actions = useHandoverActions(
  () => props.publicationId,
  () => props.draftId,
  props.prepare,
)
const target = ref('')
watch(
  () => props.open,
  (open) => {
    if (!open) return
    target.value = ''
    actions.reassign.reset()
  },
)
const submit = () =>
  target.value && actions.reassign.mutate(target.value, { onSuccess: () => emit('close') })
</script>

<template>
  <ModalDialog :open="open" title="Reassign draft" close-label="Cancel" @close="emit('close')">
    <form class="flex flex-wrap items-end gap-3" @submit.prevent="submit">
      <div>
        <label for="handover-reassign" class="mb-1 block font-medium">New editor</label>
        <select id="handover-reassign" v-model="target" class="field">
          <option value="" disabled>Choose a member</option>
          <option v-for="m in others" :key="m.userId" :value="m.userId">{{ m.name }}</option>
        </select>
      </div>
      <button type="submit" class="btn btn-outline" :disabled="actions.busy.value || !target">
        Reassign draft
      </button>
      <p class="basis-full text-ink-soft">
        This takes effect at once, without asking the current editor, and is recorded in the
        history.
      </p>
    </form>
    <p v-if="actions.problem.value" role="alert" class="mt-3 text-danger">
      {{ actions.problem.value }}
    </p>
  </ModalDialog>
</template>

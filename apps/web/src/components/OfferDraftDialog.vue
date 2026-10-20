<script setup lang="ts">
import { ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useHandover, useHandoverActions } from '../lib/draft-people'
import Explain from './Explain.vue'
import ModalDialog from './ModalDialog.vue'

/** The editor offers the draft to a named member, who chooses whether to accept (CONTEXT.md, "Handover"). */
const props = defineProps<{ open: boolean; publicationId: string; draftId: string }>()
const emit = defineEmits<{ close: [] }>()
const { others } = useHandover(
  () => props.publicationId,
  () => props.draftId,
)
const actions = useHandoverActions(
  () => props.publicationId,
  () => props.draftId,
)
const target = ref('')
watch(
  () => props.open,
  (open) => {
    if (!open) return
    target.value = ''
    actions.offer.reset()
  },
)
const submit = () =>
  target.value && actions.offer.mutate(target.value, { onSuccess: () => emit('close') })
</script>

<template>
  <ModalDialog :open="open" title="Offer draft" close-label="Cancel" @close="emit('close')">
    <Explain label="About handing over a draft" class="mb-3">
      Only one person edits a draft at a time. They offer it to a member, who chooses whether to
      accept.
    </Explain>
    <form v-if="others.length" class="flex flex-wrap items-end gap-3" @submit.prevent="submit">
      <div>
        <label for="handover-to" class="mb-1 block font-medium">Member</label>
        <select id="handover-to" v-model="target" class="field">
          <option value="" disabled>Choose a member</option>
          <option v-for="m in others" :key="m.userId" :value="m.userId">{{ m.name }}</option>
        </select>
      </div>
      <button type="submit" class="btn btn-primary" :disabled="actions.busy.value || !target">
        Offer draft
      </button>
      <p class="basis-full text-ink-soft">They are emailed, and choose whether to accept.</p>
    </form>
    <p v-else class="text-ink-soft">
      No one else is in this publication yet. Invite someone in
      <RouterLink
        :to="{ name: 'publication-settings-sharing', params: { publicationId } }"
        class="underline"
        >its settings</RouterLink
      >.
    </p>
    <p v-if="actions.problem.value" role="alert" class="mt-3 text-danger">
      {{ actions.problem.value }}
    </p>
  </ModalDialog>
</template>

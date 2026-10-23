<script setup lang="ts">
import { computed, ref } from 'vue'
import { useHandover, useHandoverActions } from '../lib/draft-people'
import ConfirmDialog from './ConfirmDialog.vue'
import HandoverHistoryDialog from './HandoverHistoryDialog.vue'
import OfferDraftDialog from './OfferDraftDialog.vue'
import ReassignDraftDialog from './ReassignDraftDialog.vue'

/**
 * The things a person can start on a draft besides writing it: handing it over, asking for it, reassigning it and
 * reading the handover history (sending for review is in the Reviews tab). Each opens a dialog, so the writer stays on the draft. What the
 * handover is waiting for is `HandoverNotices`, not here. Which buttons show depends on who the person is.
 */
const props = defineProps<{
  publicationId: string
  draftId: string
  /** Saves the editor's unsaved words first; rejects (with why) if it can't. */
  prepare?: () => Promise<unknown>
}>()
const { handover, isEditor, isOwner, others, offeredToMe, myAsk } = useHandover(
  () => props.publicationId,
  () => props.draftId,
)
const actions = useHandoverActions(
  () => props.publicationId,
  () => props.draftId,
)

type Dialog = 'offer' | 'ask' | 'reassign' | 'history'
const open = ref<Dialog | null>(null)
const close = () => (open.value = null)
/** With no buttons to show (a member who has already asked, no history) the row is left out, not left empty. */
const anyButton = computed(
  () =>
    (isEditor.value && !handover.data.value?.offer) ||
    (!isEditor.value && !myAsk.value && !offeredToMe.value) ||
    (isOwner.value && !isEditor.value && others.value.length > 0) ||
    !!handover.data.value?.history.length,
)
const asked = () => actions.ask.mutate(undefined, { onSettled: close })
</script>

<template>
  <div v-if="handover.data.value" role="group" aria-label="Handover">
    <div v-if="anyButton" class="flex flex-wrap items-center gap-2">
      <button
        v-if="isEditor && !handover.data.value.offer"
        type="button"
        class="btn btn-outline btn-sm"
        @click="open = 'offer'"
      >
        Handover draft
      </button>
      <button
        v-if="!isEditor && !myAsk && !offeredToMe"
        type="button"
        class="btn btn-outline btn-sm"
        @click="open = 'ask'"
      >
        Ask for this draft
      </button>
      <button
        v-if="isOwner && !isEditor && others.length"
        type="button"
        class="btn btn-outline btn-sm"
        @click="open = 'reassign'"
      >
        Reassign draft
      </button>
      <button
        v-if="handover.data.value.history.length"
        type="button"
        class="btn btn-quiet btn-sm"
        @click="open = 'history'"
      >
        Handover history ({{ handover.data.value.history.length }})
      </button>
    </div>
    <p v-if="actions.problem.value && open === null" role="alert" class="mt-2 text-danger">
      {{ actions.problem.value }}
    </p>

    <OfferDraftDialog
      :open="open === 'offer'"
      :publication-id="publicationId"
      :draft-id="draftId"
      :prepare="prepare"
      @close="close"
    />
    <ReassignDraftDialog
      :open="open === 'reassign'"
      :publication-id="publicationId"
      :draft-id="draftId"
      :prepare="prepare"
      @close="close"
    />
    <HandoverHistoryDialog
      :open="open === 'history'"
      :publication-id="publicationId"
      :draft-id="draftId"
      @close="close"
    />
    <ConfirmDialog
      :open="open === 'ask'"
      :title="`Ask ${handover.data.value.editorName} for this draft?`"
      confirm-label="Ask for this draft"
      confirm-tone="primary"
      :busy="actions.ask.isPending.value"
      @confirm="asked"
      @cancel="close"
    >
      They’ll see your request on the draft. Nothing changes unless they offer it to you.
    </ConfirmDialog>
  </div>
</template>

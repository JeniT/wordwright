<script setup lang="ts">
import { computed, ref } from 'vue'
import { useHandover, useHandoverActions, useReviewers } from '../lib/draft-people'
import ConfirmDialog from './ConfirmDialog.vue'
import HandoverHistoryDialog from './HandoverHistoryDialog.vue'
import OfferDraftDialog from './OfferDraftDialog.vue'
import ReassignDraftDialog from './ReassignDraftDialog.vue'
import ReviewDialog from './ReviewDialog.vue'

/**
 * The things a person can start on a draft besides writing it: handing it over, asking for it, reassigning it, sending
 * it for review and reading the handover history. Each opens a dialog, so the writer stays on the draft. What the
 * handover is waiting for is `HandoverNotices`, not here. Which buttons show depends on who the person is.
 */
const props = defineProps<{ publicationId: string; draftId: string }>()
const { handover, isEditor, isOwner, others, offeredToMe, myAsk } = useHandover(
  () => props.publicationId,
  () => props.draftId,
)
const actions = useHandoverActions(
  () => props.publicationId,
  () => props.draftId,
)
const mayManage = computed(() => isEditor.value || isOwner.value)
const reviews = useReviewers(
  () => props.publicationId,
  () => props.draftId,
  () => mayManage.value,
)
const reviewCount = computed(() => reviews.data.value?.reviewers.length ?? 0)

type Dialog = 'offer' | 'ask' | 'reassign' | 'review' | 'history'
const open = ref<Dialog | null>(null)
const close = () => (open.value = null)
const asked = () => actions.ask.mutate(undefined, { onSettled: close })
</script>

<template>
  <div v-if="handover.data.value" role="group" aria-label="Handover and review">
    <div class="flex flex-wrap items-center gap-2">
      <button
        v-if="isEditor && !handover.data.value.offer"
        type="button"
        class="btn btn-outline btn-sm"
        @click="open = 'offer'"
      >
        Offer draft
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
        v-if="mayManage"
        type="button"
        class="btn btn-outline btn-sm"
        @click="open = 'review'"
      >
        {{ isEditor ? 'Send for review' : 'Reviews'
        }}<template v-if="reviewCount"> ({{ reviewCount }})</template>
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
      @close="close"
    />
    <ReassignDraftDialog
      :open="open === 'reassign'"
      :publication-id="publicationId"
      :draft-id="draftId"
      @close="close"
    />
    <ReviewDialog
      :open="open === 'review'"
      :publication-id="publicationId"
      :draft-id="draftId"
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

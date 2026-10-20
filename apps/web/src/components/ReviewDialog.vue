<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, ref, watch } from 'vue'
import type { ReviewState } from '@wordwright/core'
import { api, errorMessage } from '../lib/api'
import { queryKeys } from '../lib/queries'
import { useHandover, useReviewers } from '../lib/draft-people'
import Explain from './Explain.vue'
import ModalDialog from './ModalDialog.vue'
import QueryState from './QueryState.vue'
import RowList from './RowList.vue'

/**
 * Sending the draft for review. The draft's title and body are frozen as a snapshot, and the people asked (by email, or
 * members of the publication) read and comment on that, not on later edits (ADR 0001). Only the editor sends; the editor
 * and owners see who is reviewing, how far they have got, and can close reviews. Others never see this.
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
const { isEditor, isOwner, others } = useHandover(
  () => props.publicationId,
  () => props.draftId,
)
const mayManage = computed(() => isEditor.value || isOwner.value)
const list = useReviewers(
  () => props.publicationId,
  () => props.draftId,
  () => mayManage.value,
)
const refresh = () =>
  queryClient.invalidateQueries({
    queryKey: queryKeys.reviewers(props.publicationId, props.draftId),
  })

const emails = ref('')
const chosen = ref<string[]>([])
const sentSummary = ref('')
watch(
  () => props.open,
  (open) => {
    if (open) sentSummary.value = ''
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
    const n = addresses.value.length + chosen.value.length
    sentSummary.value = `Sent to ${n} ${n === 1 ? 'person' : 'people'}`
    emails.value = ''
    chosen.value = []
    await refresh()
  },
})
const close = useMutation({
  mutationFn: (id: string) => api.closeReview(props.publicationId, props.draftId, id),
  onSuccess: refresh,
})
const closeAll = useMutation({
  mutationFn: () => api.closeAllReviews(props.publicationId, props.draftId),
  onSuccess: refresh,
})
const withdraw = useMutation({
  mutationFn: (id: string) => api.withdrawReviewInvitation(props.publicationId, props.draftId, id),
  onSuccess: refresh,
})
const problem = computed(() => {
  const failed = [send, close, closeAll, withdraw].find((m) => m.isError.value)
  return failed ? errorMessage(failed.error.value) : ''
})
const stateLabel: Record<ReviewState, string> = {
  open: 'Reading',
  ended: 'Finished',
  closed: 'Closed',
}
const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' })
const anyOpen = computed(() => list.data.value?.reviewers.some((r) => r.state === 'open') ?? false)
</script>

<template>
  <ModalDialog
    :open="open"
    :title="isEditor ? 'Send for review' : 'Reviews'"
    @close="emit('close')"
  >
    <form v-if="isEditor" @submit.prevent="send.mutate()">
      <p class="callout mb-3" data-testid="snapshot-notice">
        They read a <strong>snapshot</strong> of the draft as it is now, not what you write later.
        Only you see their comments, and your AI never receives them.
      </p>
      <Explain label="About sending for review" class="mb-3">
        Sending again makes a new snapshot. Reviewers can comment but can’t change the draft.
      </Explain>
      <div class="mb-3">
        <label for="review-emails" class="mb-1 block font-medium">Email addresses</label>
        <textarea
          id="review-emails"
          v-model="emails"
          rows="2"
          class="field"
          autocomplete="off"
        ></textarea>
        <p class="mt-1 text-ink-soft">
          Separate addresses with commas or new lines. We email each one a link to this snapshot
          only.
        </p>
      </div>
      <fieldset v-if="others.length" class="mb-3">
        <legend class="mb-1 font-medium">Members of this publication</legend>
        <label v-for="m in others" :key="m.userId" class="mb-1 flex items-center gap-2">
          <input v-model="chosen" type="checkbox" :value="m.userId" class="size-4 accent-accent" />
          {{ m.name }}
        </label>
      </fieldset>
      <button
        type="submit"
        class="btn btn-primary"
        :disabled="send.isPending.value || (!addresses.length && !chosen.length)"
      >
        Send for review
      </button>
      <p v-if="sentSummary" role="status" class="mt-3">{{ sentSummary }}</p>
    </form>
    <p v-else class="mb-3 text-ink-soft">
      Only the draft’s editor can send it for review. You can see who is reviewing and close their
      reviews.
    </p>
    <p v-if="problem" role="alert" class="mb-3 text-danger">{{ problem }}</p>

    <QueryState :query="list" what="who is reviewing">
      <p v-if="anyOpen" class="mb-3 text-ink-soft">
        A closed review stays readable but can’t be reopened.
      </p>
      <ul
        v-if="list.data.value?.snapshots.length"
        class="mb-3 space-y-1 text-ink-soft"
        aria-label="Snapshots sent for review"
      >
        <li v-for="s in list.data.value.snapshots" :key="s.id" data-testid="snapshot-line">
          Snapshot sent {{ when(s.sentAt) }}: {{ s.open }} still reading,
          {{ s.ended }} finished<template v-if="s.closed">, {{ s.closed }} closed</template>,
          {{ s.unresolved }} unresolved {{ s.unresolved === 1 ? 'comment' : 'comments' }}
        </li>
      </ul>
      <RowList
        v-if="list.data.value?.reviewers.length"
        :items="list.data.value.reviewers"
        label="Reviewers"
        class="mb-3"
      >
        <template #default="{ item: r }">
          <span class="min-w-0 flex-1">
            <strong>{{ r.name }}</strong> · {{ stateLabel[r.state] }} · {{ r.commentCount }}
            {{ r.commentCount === 1 ? 'comment' : 'comments' }} · sent
            {{ when(r.sentAt) }}
          </span>
        </template>
        <template #actions="{ item: r }">
          <button
            v-if="r.state === 'open'"
            type="button"
            class="btn btn-sm btn-neutral"
            :disabled="close.isPending.value"
            :aria-label="`Close review: ${r.name}`"
            @click="close.mutate(r.id)"
          >
            Close review
          </button>
        </template>
      </RowList>
      <button
        v-if="anyOpen"
        type="button"
        class="btn btn-sm btn-neutral mb-3"
        :disabled="closeAll.isPending.value"
        @click="closeAll.mutate()"
      >
        Close all reviews
      </button>
      <RowList
        v-if="list.data.value?.pending.length"
        :items="list.data.value.pending"
        label="Invitations waiting"
      >
        <template #default="{ item: p }">
          <span class="min-w-0 flex-1">{{ p.email }} · waiting for a reply</span>
        </template>
        <template #actions="{ item: p }">
          <button
            type="button"
            class="btn btn-sm btn-neutral"
            :disabled="withdraw.isPending.value"
            :aria-label="`Withdraw the invitation to ${p.email}`"
            @click="withdraw.mutate(p.id)"
          >
            Withdraw
          </button>
        </template>
      </RowList>
    </QueryState>
  </ModalDialog>
</template>

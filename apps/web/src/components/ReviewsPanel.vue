<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed } from 'vue'
import type { ReviewState } from '@wordwright/core'
import { api, errorMessage } from '../lib/api'
import { queryKeys } from '../lib/queries'
import { useReviewers } from '../lib/draft-people'
import QueryState from './QueryState.vue'
import RowList from './RowList.vue'

/**
 * Who is reviewing the draft and how far they have got: the Reviews tab beside the draft, for the editor and the
 * publication's owners. Each snapshot sent, each reviewer with their state, the invitations waiting, and the ways to
 * close a review or withdraw an invitation. Sending is `SendForReviewDialog`.
 */
const props = defineProps<{ publicationId: string; draftId: string }>()
const queryClient = useQueryClient()
const list = useReviewers(
  () => props.publicationId,
  () => props.draftId,
  () => true,
)
const refresh = () =>
  queryClient.invalidateQueries({
    queryKey: queryKeys.reviewers(props.publicationId, props.draftId),
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
  const failed = [close, closeAll, withdraw].find((m) => m.isError.value)
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
  <section aria-labelledby="reviews-heading" class="text-sm">
    <!-- The tab beside the draft already says "Reviews"; the heading is for screen readers moving by headings. -->
    <h2 id="reviews-heading" class="sr-only">Reviews</h2>
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
            {{ r.commentCount === 1 ? 'comment' : 'comments' }} · sent {{ when(r.sentAt) }}
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
  </section>
</template>

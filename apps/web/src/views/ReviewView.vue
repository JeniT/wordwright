<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { splitBlocks, type CommentInput } from '@wordwright/core'
import CommentCard from '../components/CommentCard.vue'
import CommentForm from '../components/CommentForm.vue'
import QueryState from '../components/QueryState.vue'
import RichEditor from '../components/RichEditor.vue'
import { api, errorMessage } from '../lib/api'
import { queryKeys } from '../lib/queries'
import { useSessionStore } from '../stores/session'

/**
 * One review: the copy of the draft that was sent (a snapshot, not the editor's latest words) and the comments this
 * person has made on it. Nobody else's comments are here and nothing else of the publication is. While the review is open
 * they can add comments or end it; an ended or closed review is read-only but still shows both.
 */
const props = defineProps<{ id: string }>()
const queryClient = useQueryClient()
const session = useSessionStore()
const review = useQuery({
  queryKey: computed(() => queryKeys.review(props.id)),
  queryFn: () => api.getReview(props.id),
})
const blocks = computed(() => splitBlocks(review.data.value?.draft.body ?? ''))
const body = computed(() => review.data.value?.draft.body ?? '')

async function add(input: CommentInput) {
  await api.commentOnReview(props.id, input)
  await queryClient.invalidateQueries({ queryKey: queryKeys.review(props.id) })
}
const end = useMutation({
  mutationFn: () => api.endReview(props.id),
  // Ending is final for this copy: the page stays, now read-only, with the copy and the comments.
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.reviews() })
    await queryClient.invalidateQueries({ queryKey: queryKeys.review(props.id) })
  },
})
</script>

<template>
  <div>
    <p class="mb-4 text-sm">
      <RouterLink :to="{ name: 'reviews' }" class="underline">← All your reviews</RouterLink>
    </p>
    <QueryState :query="review" what="this draft">
      <template v-if="review.data.value">
        <h1 class="mb-1 font-display text-3xl font-semibold break-words">
          {{ review.data.value.draft.title || 'Untitled draft' }}
        </h1>
        <p class="meta mb-4">
          In {{ review.data.value.publicationName }}
          <template v-if="review.data.value.inviterName">
            · asked by {{ review.data.value.inviterName }}</template
          >
        </p>

        <p
          v-if="review.data.value.state === 'ended'"
          class="callout mb-4"
          data-testid="review-ended"
        >
          You ended this review. The snapshot you read and your comments are kept, but you can’t add
          more.
        </p>
        <p
          v-else-if="review.data.value.state === 'closed'"
          class="callout mb-4"
          data-testid="review-ended"
        >
          This review is closed, so you can’t add comments. The snapshot you read and your comments
          are kept.
        </p>
        <p v-else class="callout mb-4 text-sm">
          You are reading a snapshot of the draft as it was when it was sent to you.
        </p>
        <RichEditor :model-value="body" :editable="false" />

        <section class="mt-8" aria-labelledby="mine">
          <h2 id="mine" class="mb-2 font-display text-xl font-semibold">Your comments</h2>
          <p v-if="!review.data.value.comments.length" class="text-sm text-ink-soft">
            You haven’t commented yet.
          </p>
          <ol v-else class="space-y-3">
            <li v-for="(c, i) in review.data.value.comments" :key="c.id">
              <CommentCard
                :entry="{ ...c, number: i + 1 }"
                kind="plain"
                :viewer-id="session.user?.id"
              />
            </li>
          </ol>
          <CommentForm
            v-if="review.data.value.state === 'open'"
            :blocks="blocks"
            :add="add"
            audience="Only you and the draft’s editor will see this."
          />
        </section>

        <section
          v-if="review.data.value.state === 'open'"
          class="mt-10 border-t border-line pt-4"
          aria-label="End the review"
        >
          <p class="mb-2 text-ink-soft">
            Ending the review tells the editor you have finished and how many comments you left. You
            can’t add more afterwards.
          </p>
          <button
            type="button"
            class="btn btn-outline"
            :disabled="end.isPending.value"
            @click="end.mutate()"
          >
            End review
          </button>
          <p v-if="end.isError.value" role="alert" class="mt-2 text-danger">
            {{ errorMessage(end.error.value) }}
          </p>
        </section>
      </template>
    </QueryState>
  </div>
</template>

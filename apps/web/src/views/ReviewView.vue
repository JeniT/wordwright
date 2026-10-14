<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { splitBlocks, type CommentInput } from '@lfwa/core'
import CommentCard from '../components/CommentCard.vue'
import CommentForm from '../components/CommentForm.vue'
import QueryState from '../components/QueryState.vue'
import RichEditor from '../components/RichEditor.vue'
import { api, errorMessage } from '../lib/api'
import { queryKeys } from '../lib/queries'
import { useSessionStore } from '../stores/session'

/**
 * One review: the draft to read, as it is now, and the comments this person has made on it. Nobody else's comments
 * are here and nothing else of the profile is. While the review is open they can add comments or stop reviewing.
 */
const props = defineProps<{ id: string }>()
const queryClient = useQueryClient()
const router = useRouter()
const session = useSessionStore()
const review = useQuery({
  queryKey: computed(() => queryKeys.review(props.id)),
  queryFn: () => api.getReview(props.id),
})
const blocks = computed(() => splitBlocks(review.data.value?.draft?.body ?? ''))
const body = computed(() => review.data.value?.draft?.body ?? '')

async function add(input: CommentInput) {
  await api.commentOnReview(props.id, input)
  await queryClient.invalidateQueries({ queryKey: queryKeys.review(props.id) })
}
const leave = useMutation({
  mutationFn: () => api.leaveReview(props.id),
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.reviews() })
    await router.push({ name: 'reviews' })
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
          {{ review.data.value.draft?.title || review.data.value.draftTitle || 'Untitled draft' }}
        </h1>
        <p class="meta mb-4">
          In {{ review.data.value.profileName }}
          <template v-if="review.data.value.inviterName">
            · asked by {{ review.data.value.inviterName }}</template
          >
        </p>

        <p
          v-if="review.data.value.state !== 'open'"
          class="callout mb-4"
          data-testid="review-ended"
        >
          <template v-if="review.data.value.state === 'left'">
            You stopped reviewing this draft, so it isn't shown any more. Your comments are kept
            with it.
          </template>
          <template v-else>
            This draft is no longer shared with you. Your comments are kept with it.
          </template>
        </p>

        <template v-if="review.data.value.draft">
          <p class="callout mb-4 text-sm">
            You are reading this draft, not editing it. Say what you think in a comment below. Only
            you and the draft's editor will see your comments.
          </p>
          <RichEditor :model-value="body" :editable="false" />
        </template>

        <section class="mt-8" aria-labelledby="mine">
          <h2 id="mine" class="mb-2 font-display text-xl font-semibold">Your comments</h2>
          <p v-if="!review.data.value.comments.length" class="text-sm text-ink-soft">
            You haven't commented on this draft yet.
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
            v-if="review.data.value.draft"
            :blocks="blocks"
            :add="add"
            audience="Only you and the draft's editor will see this."
          />
        </section>

        <section
          v-if="review.data.value.state === 'open'"
          class="mt-10 border-t border-line pt-4"
          aria-labelledby="stop"
        >
          <h2 id="stop" class="mb-1 font-medium">Finished?</h2>
          <p class="mb-2 text-sm text-ink-soft">
            You can stop reviewing at any time. You won't see the draft again, and your comments
            stay with it.
          </p>
          <button
            type="button"
            class="btn btn-outline"
            :disabled="leave.isPending.value"
            @click="leave.mutate()"
          >
            Stop reviewing
          </button>
          <p v-if="leave.isError.value" role="alert" class="mt-2 text-danger">
            {{ errorMessage(leave.error.value) }}
          </p>
        </section>
      </template>
    </QueryState>
  </div>
</template>

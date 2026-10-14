<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { RouterLink } from 'vue-router'
import type { ReviewState } from '@lfwa/core'
import QueryState from '../components/QueryState.vue'
import { api } from '../lib/api'
import { queryKeys } from '../lib/queries'
import { useSessionStore } from '../stores/session'

/**
 * Where a reviewer lands: the drafts they were asked to read and comment on, and nothing else. An account made only
 * to review has no profiles, so this is the whole of the app to it (ADR 0002).
 */
const session = useSessionStore()
const reviews = useQuery({ queryKey: queryKeys.reviews(), queryFn: () => api.listReviews() })
const stateLabel: Record<ReviewState, string> = {
  open: 'Open',
  left: 'You stopped reviewing',
  revoked: 'No longer shared with you',
}
const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' })
</script>

<template>
  <div>
    <h1 class="mb-1 font-display text-3xl font-semibold">Drafts to review</h1>
    <p class="mb-6 text-ink-soft">
      You were asked to read these and say what you think. You can see only the drafts listed here.
    </p>
    <QueryState :query="reviews" what="your reviews">
      <p v-if="!reviews.data.value?.length" class="text-ink-soft">
        Nothing to review yet. When someone asks for your comments on a draft, it appears here.
      </p>
      <ul v-else class="space-y-3" aria-label="Your reviews">
        <li v-for="r in reviews.data.value" :key="r.id" class="card p-4">
          <h2 class="font-semibold break-words">
            <RouterLink :to="{ name: 'review', params: { id: r.id } }" class="link">{{
              r.draftTitle || 'Untitled draft'
            }}</RouterLink>
          </h2>
          <p class="meta mt-1">
            In {{ r.profileName }}
            <template v-if="r.inviterName"> · asked by {{ r.inviterName }}</template>
            · {{ when(r.createdAt) }}
          </p>
          <p class="mt-1 text-sm">
            <span class="chip" :class="r.state === 'open' ? 'chip-quiet' : 'chip-quiet'">{{
              stateLabel[r.state]
            }}</span>
          </p>
        </li>
      </ul>
    </QueryState>

    <section v-if="session.user" class="mt-10 border-t border-line pt-6" aria-labelledby="write">
      <h2 id="write" class="mb-1 font-display text-xl font-semibold">Want to write your own?</h2>
      <p class="mb-3 text-sm text-ink-soft">
        You can turn this into a full account, with your own profiles and ideas. Your reviews stay
        as they are.
      </p>
      <RouterLink :to="{ name: 'start-writing' }" class="btn btn-outline">Start writing</RouterLink>
    </section>
  </div>
</template>

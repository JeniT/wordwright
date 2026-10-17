<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { RECENT_DAYS_DEFAULT } from '@wordwright/core'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import type { RouteLocationRaw } from 'vue-router'
import { api, errorMessage } from '../lib/api'
import { queryKeys, useSources } from '../lib/queries'
import { useDecidePosts } from '../lib/recent-posts'
import Explain from './Explain.vue'
import LandingSection from './LandingSection.vue'
import QueryState from './QueryState.vue'
import RecentPostRow from './RecentPostRow.vue'

/**
 * A summary of the publication's feeds for a landing page: the newest few posts still waiting for a decision, with a
 * link to Search to configure the feeds and see more. The rows are the Search page's own (`RecentPostRow`), so a
 * post can be added or ignored from here too. It asks for the same lists, under the same keys, as the Search page
 * (at its default period), so the two share what has been fetched and what is decided; it never asks the feeds to
 * check again.
 */
const props = defineProps<{ publicationId: string; to: RouteLocationRaw }>()
const SHOWN = 5

const sources = useSources(() => props.publicationId)
const byId = computed(() => new Map((sources.data.value ?? []).map((s) => [s.id, s])))
const feedKey = computed(() => (sources.data.value ?? []).map((s) => s.id).join(','))
const posts = useQuery({
  queryKey: computed(() =>
    queryKeys.recentPosts(props.publicationId, RECENT_DAYS_DEFAULT, feedKey.value),
  ),
  queryFn: () => api.recentPosts(props.publicationId, RECENT_DAYS_DEFAULT),
  enabled: computed(() => sources.isSuccess.value && (sources.data.value?.length ?? 0) > 0),
  staleTime: 5 * 60_000,
})
// Those decided about (added or ignored) go to the end of the full list; here only what still waits is of use.
const top = computed(() =>
  (posts.data.value?.posts ?? []).filter((p) => p.status === 'new').slice(0, SHOWN),
)
const nameOf = (id: string) => {
  const s = byId.value.get(id)
  return s?.title ?? s?.url.replace(/^https?:\/\//, '') ?? 'a feed'
}
const { decide, notice, busy } = useDecidePosts(() => props.publicationId)
</script>

<template>
  <LandingSection level="publication" step="search" title="Search">
    <template #actions>
      <RouterLink :to="to" class="link text-sm">See all posts and feeds</RouterLink>
    </template>
    <Explain tutorial-only class="mb-4">
      A feed is a blog, newsletter or journal we check for new posts.
    </Explain>
    <QueryState :query="sources" what="your feeds">
      <p v-if="!sources.data.value?.length" class="text-ink-soft">
        No feeds yet.
        <RouterLink :to="to" class="link">Add a blog, newsletter or journal</RouterLink> and its
        newest posts will show up here.
      </p>
      <template v-else>
        <QueryState :query="posts" what="your feeds" loading="Reading your feeds…" detail>
          <p v-if="!top.length" class="text-ink-soft">
            Nothing new from your feeds in the last month.
          </p>
          <ul
            v-else
            class="divide-y divide-line rounded-ctl border border-line bg-surface"
            aria-label="Recent posts from your feeds"
          >
            <RecentPostRow
              v-for="post in top"
              :key="`${post.sourceId}-${post.id}`"
              :post="post"
              :feed-name="nameOf(post.sourceId)"
              :feed-icon-url="byId.get(post.sourceId)?.iconUrl"
              :feed-icon-square="byId.get(post.sourceId)?.iconSquare"
              :busy="busy"
              @decide="(what) => decide.mutate({ what, post })"
            />
          </ul>
          <div v-if="decide.isError.value" role="alert" class="mt-2 text-sm text-danger">
            {{ errorMessage(decide.error.value) }}
            <button type="button" class="ml-2 underline" @click="decide.reset()">Dismiss</button>
          </div>
          <p class="sr-only" aria-live="polite">{{ notice }}</p>
        </QueryState>
      </template>
    </QueryState>
  </LandingSection>
</template>

<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { RECENT_DAYS_DEFAULT } from '@lfwa/core'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import type { RouteLocationRaw } from 'vue-router'
import { api, errorMessage } from '../lib/api'
import LandingSection from './LandingSection.vue'
import ProfileImage from './ProfileImage.vue'

/**
 * A summary of the profile's feeds for a landing page: the newest few posts still waiting for a decision, with a
 * link to Search to choose among them, configure the feeds and see more. It asks for the same lists, under the same
 * keys, as the Search page (at its default period), so the two share what has been fetched; it never asks the
 * feeds to check again.
 */
const props = defineProps<{ profileId: string; to: RouteLocationRaw }>()
const SHOWN = 5

const sources = useQuery({
  queryKey: ['sources', () => props.profileId],
  queryFn: () => api.listSources(props.profileId),
})
const byId = computed(() => new Map((sources.data.value ?? []).map((s) => [s.id, s])))
const feedKey = computed(() => (sources.data.value ?? []).map((s) => s.id).join(','))
const posts = useQuery({
  queryKey: ['recent-posts', () => props.profileId, RECENT_DAYS_DEFAULT, feedKey],
  queryFn: () => api.recentPosts(props.profileId, RECENT_DAYS_DEFAULT),
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
const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : ''
</script>

<template>
  <LandingSection level="profile" step="search" title="Search">
    <template #actions>
      <RouterLink :to="to" class="link text-sm">See more and set up feeds</RouterLink>
    </template>
    <p v-if="sources.isPending.value" class="text-ink-soft">Loading…</p>
    <p v-else-if="sources.isError.value" role="alert" class="text-danger">
      We couldn’t load your feeds. Try reloading the page.
    </p>
    <p v-else-if="!sources.data.value?.length" class="text-ink-soft">
      No feeds yet.
      <RouterLink :to="to" class="link">Add a blog, newsletter or journal</RouterLink> and its
      newest posts will show up here.
    </p>
    <template v-else>
      <p v-if="posts.isPending.value" class="text-ink-soft">Reading your feeds…</p>
      <p v-else-if="posts.isError.value" role="alert" class="text-danger">
        {{ errorMessage(posts.error.value) }}
        <button type="button" class="underline" @click="posts.refetch()">Try again</button>
      </p>
      <p v-else-if="!top.length" class="text-ink-soft">
        Nothing new from your feeds in the last month.
      </p>
      <ul v-else class="panel divide-y divide-line" aria-label="Recent posts from your feeds">
        <li v-for="post in top" :key="`${post.sourceId}-${post.id}`" class="flex gap-3 px-4 py-3">
          <ProfileImage
            :id="post.sourceId"
            :name="nameOf(post.sourceId)"
            :image-url="byId.get(post.sourceId)?.iconUrl"
            size="xs"
            kind="source"
            class="mt-0.5"
          />
          <div class="min-w-0 flex-1">
            <a
              :href="post.url"
              target="_blank"
              rel="noopener noreferrer"
              class="font-medium break-words underline"
            >
              {{ post.title }}<span class="sr-only"> (opens in a new tab)</span>
            </a>
            <p class="meta break-words">
              {{ nameOf(post.sourceId)
              }}<template v-if="post.publishedAt"> · {{ when(post.publishedAt) }}</template>
            </p>
          </div>
        </li>
      </ul>
    </template>
  </LandingSection>
</template>

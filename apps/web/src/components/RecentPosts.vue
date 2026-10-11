<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { RECENT_DAYS_DEFAULT, type Source } from '@lfwa/core'
import { computed, ref } from 'vue'
import { api, errorMessage } from '../lib/api'
import ProfileImage from './ProfileImage.vue'

const props = defineProps<{ profileId: string }>()
const queryClient = useQueryClient()

const WINDOWS = [
  [7, 'the last week'],
  [30, 'the last month'],
  [90, 'the last 3 months'],
  [365, 'the last year'],
] as const
const days = ref<number>(RECENT_DAYS_DEFAULT)
const windowName = computed(
  () => WINDOWS.find(([d]) => d === days.value)?.[1] ?? `${days.value} days`,
)

// The same list the feeds section shows; it supplies each post's feed name and logo.
const sources = useQuery({
  queryKey: ['sources', () => props.profileId],
  queryFn: () => api.listSources(props.profileId),
})
const byId = computed(() => new Map((sources.data.value ?? []).map((s) => [s.id, s])))
const nameOf = (s: Source | undefined) => s?.title ?? s?.url.replace(/^https?:\/\//, '') ?? 'a feed'

// The feeds are part of the key: adding, removing or reordering one asks again (the server mostly
// answers from what it has kept).
const feedKey = computed(() => (sources.data.value ?? []).map((s) => s.id).join(','))
const posts = useQuery({
  queryKey: ['recent-posts', () => props.profileId, days, feedKey],
  queryFn: () => api.recentPosts(props.profileId, days.value),
  enabled: computed(() => sources.isSuccess.value && (sources.data.value?.length ?? 0) > 0),
  staleTime: 5 * 60_000,
})

const refresh = useMutation({
  mutationFn: () => api.recentPosts(props.profileId, days.value, true),
  onSuccess: (fresh) => {
    queryClient.setQueryData(['recent-posts', props.profileId, days.value, feedKey.value], fresh)
    queryClient.invalidateQueries({ queryKey: ['sources'] }) // each feed's "last worked" may have changed
  },
})
const shown = posts.data

const when = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const failedNames = computed(() =>
  (shown.value?.failed ?? []).map((f) => nameOf(byId.value.get(f.sourceId))),
)
</script>

<template>
  <section aria-labelledby="recent-heading" class="mb-10">
    <div class="mb-2 flex flex-wrap items-end justify-between gap-3">
      <h2 id="recent-heading" class="font-serif text-xl font-semibold">Recent posts</h2>
      <div class="flex items-end gap-2">
        <div>
          <label for="recent-days" class="mb-1 block text-sm font-medium">Show posts from</label>
          <select
            id="recent-days"
            v-model.number="days"
            class="rounded border border-stone-300 bg-white px-3 py-2 focus-visible:outline-2 focus-visible:outline-accent"
          >
            <option v-for="[d, label] in WINDOWS" :key="d" :value="d">{{ label }}</option>
          </select>
        </div>
        <button
          type="button"
          class="rounded border border-stone-300 px-3 py-2 text-sm disabled:opacity-60"
          :disabled="refresh.isPending.value || !sources.data.value?.length"
          @click="refresh.mutate()"
        >
          {{ refresh.isPending.value ? 'Checking…' : 'Check for new posts' }}
        </button>
      </div>
    </div>
    <p class="mb-3 text-sm text-stone-600">
      The newest posts from all your feeds together, so you can respond to recent work. A feed that
      hasn’t posted in a while won’t appear here.
    </p>

    <p v-if="sources.isPending.value">Loading…</p>
    <p v-else-if="sources.isError.value" role="alert" class="text-red-700">
      We couldn’t load your feeds, so there are no posts to show. Reload the page to try again.
    </p>
    <p v-else-if="!sources.data.value?.length" class="text-sm text-stone-700">
      Add a feed below and its newest posts will show up here.
    </p>
    <template v-else>
      <p v-if="posts.isPending.value">Reading your feeds…</p>
      <div v-else-if="posts.isError.value" role="alert" class="text-red-700">
        <p>{{ errorMessage(posts.error.value) }}</p>
        <button type="button" class="underline" @click="posts.refetch()">Try again</button>
      </div>
      <template v-else-if="shown">
        <p v-if="refresh.isError.value" role="alert" class="mb-2 text-red-700">
          {{ errorMessage(refresh.error.value) }}
        </p>
        <p v-if="shown.failed.length" role="alert" class="mb-2 text-sm text-red-700">
          We couldn’t read {{ failedNames.join(', ') }} just now, so recent posts from
          {{ shown.failed.length === 1 ? 'it' : 'them' }} may be missing.
        </p>

        <p v-if="!shown.posts.length" class="text-stone-700">
          Nothing has been posted in {{ windowName }}. Try a longer period.
        </p>
        <ul v-else class="divide-y divide-stone-200 rounded border border-stone-200 bg-white">
          <li
            v-for="post in shown.posts"
            :key="`${post.sourceId}-${post.id}`"
            class="flex gap-3 px-3 py-2"
          >
            <ProfileImage
              :id="post.sourceId"
              :name="nameOf(byId.get(post.sourceId))"
              :image-url="byId.get(post.sourceId)?.iconUrl"
              size="xs"
              class="mt-0.5"
            />
            <div class="min-w-0 flex-1">
              <a
                :href="post.url"
                target="_blank"
                rel="noopener noreferrer"
                class="break-words font-medium underline"
              >
                {{ post.title }}<span class="sr-only"> (opens in a new tab)</span>
              </a>
              <p class="break-words text-sm text-stone-600">
                {{ nameOf(byId.get(post.sourceId)) }}
                <template v-if="post.authors.length"> · {{ post.authors.join(', ') }}</template>
                · {{ when(post.publishedAt!) }}
              </p>
              <p v-if="post.summary" class="line-clamp-2 break-words text-sm text-stone-700">
                {{ post.summary }}
              </p>
            </div>
          </li>
        </ul>
        <p v-if="shown.omitted" class="mt-2 text-sm text-stone-600">
          {{ shown.omitted }} older {{ shown.omitted === 1 ? 'post' : 'posts' }} in this period
          aren’t shown. Choose a shorter period to see them.
        </p>
        <p v-if="shown.undated" class="mt-2 text-sm text-stone-600">
          {{ shown.undated }} {{ shown.undated === 1 ? 'post has' : 'posts have' }} no date, so
          can’t be placed in time. Open a feed’s own recent posts below to see
          {{ shown.undated === 1 ? 'it' : 'them' }}.
        </p>
      </template>
    </template>
  </section>
</template>

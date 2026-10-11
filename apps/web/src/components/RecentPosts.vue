<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { RECENT_DAYS_DEFAULT, type Source } from '@lfwa/core'
import { computed, ref, watch } from 'vue'
import { api, errorMessage } from '../lib/api'
import PageNav from './PageNav.vue'
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

// The server sends up to 100 posts; five at a time is easier to take in. A new period or a fresh
// check starts again at the first page.
const PAGE_SIZE = 5
const page = ref(1)
watch([days, () => shown.value], () => (page.value = 1))
const pageCount = computed(() =>
  Math.max(1, Math.ceil((shown.value?.posts.length ?? 0) / PAGE_SIZE)),
)
const pagePosts = computed(() =>
  (shown.value?.posts ?? []).slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE),
)
const total = computed(() => shown.value?.posts.length ?? 0)
const first = computed(() => (page.value - 1) * PAGE_SIZE + 1)
const last = computed(() => Math.min(page.value * PAGE_SIZE, total.value))
const nav = computed(() => ({
  page: page.value,
  pageCount: pageCount.value,
  first: first.value,
  last: last.value,
  total: total.value,
  noun: 'posts',
  size: PAGE_SIZE,
}))
const heading = ref<HTMLElement | null>(null)
const go = (step: -1 | 1) => (page.value += step)
/** From the bottom of the list the new page starts a long way up, so go back to the top of it. */
function goFromBottom(step: -1 | 1) {
  go(step)
  heading.value?.scrollIntoView?.({ block: 'start' })
  heading.value?.focus({ preventScroll: true }) // keyboard users continue from the top too
}

const when = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const failedNames = computed(() =>
  (shown.value?.failed ?? []).map((f) => nameOf(byId.value.get(f.sourceId))),
)
</script>

<template>
  <section aria-labelledby="recent-heading" class="mb-10">
    <div class="mb-2 flex flex-wrap items-end justify-between gap-3">
      <h2
        id="recent-heading"
        ref="heading"
        tabindex="-1"
        class="font-serif text-xl font-semibold focus:outline-none"
      >
        Recent posts
      </h2>
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

        <PageNav
          v-if="pageCount > 1"
          v-bind="nav"
          label="Pages of recent posts, above the list"
          announce
          class="mb-3"
          @go="go"
        />
        <p v-if="!shown.posts.length" class="text-stone-700">
          Nothing has been posted in {{ windowName }}. Try a longer period.
        </p>
        <ul v-else class="divide-y divide-stone-200 rounded border border-stone-200 bg-white">
          <li
            v-for="post in pagePosts"
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
        <PageNav
          v-if="pageCount > 1"
          v-bind="nav"
          label="Pages of recent posts, below the list"
          class="mt-3"
          @go="goFromBottom"
        />
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

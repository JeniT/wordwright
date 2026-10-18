<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { RECENT_DAYS_DEFAULT, type Source } from '@wordwright/core'
import { computed, ref, watch } from 'vue'
import { api, errorMessage } from '../lib/api'
import { invalidateRoots, queryKeys, useSources } from '../lib/queries'
import { useDecidePosts } from '../lib/recent-posts'
import { PAGE_SIZE } from '../lib/paging'
import Explain from './Explain.vue'
import PageNav from './PageNav.vue'
import RecentPostRow from './RecentPostRow.vue'
import QueryState from './QueryState.vue'

const props = defineProps<{ publicationId: string }>()
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

// The publication’s feeds; they supply each post's feed name and logo.
const sources = useSources(() => props.publicationId)
const byId = computed(() => new Map((sources.data.value ?? []).map((s) => [s.id, s])))
const nameOf = (s: Source | undefined) => s?.title ?? s?.url.replace(/^https?:\/\//, '') ?? 'a feed'

// The feeds are part of the key: adding or removing one asks again (the server mostly
// answers from what it has kept).
const feedKey = computed(() => (sources.data.value ?? []).map((s) => s.id).join(','))
const posts = useQuery({
  queryKey: computed(() => queryKeys.recentPosts(props.publicationId, days.value, feedKey.value)),
  queryFn: () => api.recentPosts(props.publicationId, days.value),
  enabled: computed(() => sources.isSuccess.value && (sources.data.value?.length ?? 0) > 0),
  staleTime: 5 * 60_000,
})

const refresh = useMutation({
  mutationFn: () => api.recentPosts(props.publicationId, days.value, true),
  onSuccess: (fresh) => {
    queryClient.setQueryData(
      queryKeys.recentPosts(props.publicationId, days.value, feedKey.value),
      fresh,
    )
    page.value = 1
    invalidateRoots(queryClient, 'sources') // each feed's "last worked" may have changed
  },
})
const shown = posts.data

// The server sends up to 100 posts; five at a time is easier to take in. A new period or a fresh
// check starts again at the first page; deciding about a post doesn't: the post goes to the end, and the next one
// waiting takes its place.
const page = ref(1)
watch(days, () => (page.value = 1))
const pageCount = computed(() =>
  Math.max(1, Math.ceil((shown.value?.posts.length ?? 0) / PAGE_SIZE)),
)
// If the list gets shorter (a post was reconsidered, or the feeds changed), don't be left past its end.
watch(
  () => pageCount.value,
  (count) => {
    if (page.value > count) page.value = count
  },
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

// ---- deciding: Add to the reading list, Ignore, or take either back (shared with the publication's landing page)
const { decide, notice, busy } = useDecidePosts(() => props.publicationId)

const failedNames = computed(() =>
  (shown.value?.failed ?? []).map((f) => nameOf(byId.value.get(f.sourceId))),
)
</script>

<template>
  <section aria-labelledby="recent-heading" class="mb-10">
    <div class="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div class="flex flex-wrap items-center gap-2">
        <h2
          id="recent-heading"
          ref="heading"
          tabindex="-1"
          class="font-display text-xl font-semibold focus:outline-none"
        >
          Recent posts
        </h2>
        <Explain label="About ignoring posts">
          Ignored posts move to the end of the list, where you can reconsider them.
        </Explain>
      </div>
      <div class="flex items-end gap-2">
        <div>
          <label for="recent-days" class="mb-1 block text-sm font-medium">Show posts from</label>
          <select id="recent-days" v-model.number="days" class="field field-compact">
            <option v-for="[d, label] in WINDOWS" :key="d" :value="d">{{ label }}</option>
          </select>
        </div>
        <button
          type="button"
          class="btn btn-neutral btn-sm"
          :disabled="refresh.isPending.value || !sources.data.value?.length"
          @click="refresh.mutate()"
        >
          {{ refresh.isPending.value ? 'Checking…' : 'Check for new posts' }}
        </button>
      </div>
    </div>
    <QueryState :query="sources" what="your feeds">
      <p v-if="!sources.data.value?.length" class="text-ink-soft">No feeds yet.</p>
      <template v-else>
        <QueryState :query="posts" what="your feeds" loading="Reading your feeds…" detail>
          <template v-if="shown">
            <p v-if="refresh.isError.value" role="alert" class="mb-2 text-danger">
              {{ errorMessage(refresh.error.value) }}
            </p>
            <div v-if="decide.isError.value" role="alert" class="mb-2 text-sm text-danger">
              {{ errorMessage(decide.error.value) }}
              <button type="button" class="ml-2 underline" @click="decide.reset()">Dismiss</button>
            </div>
            <p class="sr-only" aria-live="polite">{{ notice }}</p>
            <p v-if="shown.failed.length" role="alert" class="mb-2 text-sm text-danger">
              Sorry, we couldn’t read {{ failedNames.join(', ') }} just now, so
              {{ shown.failed.length === 1 ? 'its' : 'their' }} recent posts may be missing. Check
              for new posts to try again.
            </p>

            <PageNav
              v-if="pageCount > 1"
              v-bind="nav"
              label="Pages of recent posts, above the list"
              announce
              class="mb-3"
              @go="go"
            />
            <p v-if="!shown.posts.length" class="text-ink-soft">
              Nothing has been posted in {{ windowName }}. Try a longer period.
            </p>
            <ul v-else class="divide-y divide-line rounded-ctl border border-line bg-surface">
              <RecentPostRow
                v-for="post in pagePosts"
                :key="`${post.sourceId}-${post.id}`"
                :post="post"
                :feed-name="nameOf(byId.get(post.sourceId))"
                :feed-icon-url="byId.get(post.sourceId)?.iconUrl"
                :feed-icon-square="byId.get(post.sourceId)?.iconSquare"
                :busy="busy"
                @decide="(what) => decide.mutate({ what, post })"
              />
            </ul>
            <PageNav
              v-if="pageCount > 1"
              v-bind="nav"
              label="Pages of recent posts, below the list"
              class="mt-3"
              @go="goFromBottom"
            />
            <p v-if="shown.omitted" class="mt-2 text-sm text-ink-soft">
              {{ shown.omitted }} older {{ shown.omitted === 1 ? 'post' : 'posts' }} in this period
              aren’t shown. Choose a shorter period to see them.
            </p>
            <p v-if="shown.undated" class="mt-2 text-sm text-ink-soft">
              {{ shown.undated }} {{ shown.undated === 1 ? 'post has' : 'posts have' }} no date, so
              {{ shown.undated === 1 ? 'it isn’t' : 'they aren’t' }} listed. You can see
              {{ shown.undated === 1 ? 'it' : 'them' }} under Manage feeds.
            </p>
          </template>
        </QueryState>
      </template>
    </QueryState>
  </section>
</template>

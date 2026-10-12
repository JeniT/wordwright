<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import type { Source } from '@lfwa/core'
import { ref, watch } from 'vue'
import { api } from '../lib/api'
import { invalidateRoots } from '../lib/queries'
import QueryState from './QueryState.vue'

const props = defineProps<{ profileId: string; source: Source; name: string }>()
const SHOWN = 5

// A feed is only asked about once someone looks, so a long list of sources isn't a long list of requests.
const opened = ref(false)
const queryClient = useQueryClient()
const posts = useQuery({
  queryKey: ['source-items', () => props.profileId, () => props.source.id],
  queryFn: () => api.sourceItems(props.profileId, props.source.id),
  enabled: opened,
  staleTime: 5 * 60_000,
})

// Reading the feed may have changed whether it works; bring the list's note up to date.
watch(
  () => posts.data.value,
  (data) => {
    if (
      data &&
      (data.lastError !== props.source.lastError || data.lastWorkedAt !== props.source.lastWorkedAt)
    ) {
      invalidateRoots(queryClient, 'sources')
    }
  },
)

const when = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
</script>

<template>
  <details class="mt-1 text-sm" @toggle="opened ||= ($event.target as HTMLDetailsElement).open">
    <summary class="cursor-pointer text-ink-soft">
      Recent posts<span class="sr-only"> from {{ name }}</span>
    </summary>
    <div class="mt-1">
      <QueryState :query="posts" what="the feed" loading="Reading the feed…" detail>
        <template v-if="posts.data.value">
          <p v-if="posts.data.value.lastError" role="alert" class="mb-1 text-danger">
            We couldn’t read this feed just now: {{ posts.data.value.lastError }}
            <template v-if="posts.data.value.lastWorkedAt">
              It last worked on {{ when(posts.data.value.lastWorkedAt) }}.
            </template>
          </p>
          <p v-if="!posts.data.value.items.length && !posts.data.value.lastError">
            This feed has no posts in it yet.
          </p>
          <ul v-else class="space-y-1">
            <li v-for="item in posts.data.value.items.slice(0, SHOWN)" :key="item.id">
              <a :href="item.url" target="_blank" rel="noopener noreferrer" class="underline">
                {{ item.title }}<span class="sr-only"> (opens in a new tab)</span>
              </a>
              <span v-if="item.publishedAt || item.authors.length" class="text-ink-soft">
                ·
                {{
                  [item.authors.join(', '), item.publishedAt ? when(item.publishedAt) : '']
                    .filter(Boolean)
                    .join(', ')
                }}
              </span>
            </li>
          </ul>
          <p v-if="posts.data.value.items.length > SHOWN" class="mt-1 text-ink-soft">
            and {{ posts.data.value.items.length - SHOWN }} more
          </p>
        </template>
      </QueryState>
    </div>
  </details>
</template>

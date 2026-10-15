<script setup lang="ts">
import { errorMessage } from '../lib/api'
import type { QueryStatus } from '../lib/queries'

/**
 * Loading and error states for a query, so every list and section says the same things the same way: a quiet
 * "Loading…", or what could not be loaded with a way to try again. The content (its own empty state included) is
 * the slot, shown once the data is there. Pages about one idea or publication use `IdeaGate` / `PublicationGate`, which
 * also handle "not found".
 */
defineProps<{
  /** The query (what `useQuery` returns). */
  query: QueryStatus
  /** What could not be loaded, after "We couldn't load": "the notes", "your feeds". */
  what: string
  /** Replaces "Loading…" where it helps to say what is loading ("Reading your feeds…"). */
  loading?: string
  /** Adds the server's reason after the message, for errors a person can act on (a rate limit). */
  detail?: boolean
}>()
</script>

<template>
  <p v-if="query.isPending.value" class="text-ink-soft">{{ loading ?? 'Loading…' }}</p>
  <div v-else-if="query.isError.value" role="alert" class="mb-4">
    <p class="text-danger">
      We couldn't load {{ what }}.
      <template v-if="detail">{{ errorMessage(query.error?.value) }}</template>
      <template v-else>Check your connection and try again.</template>
    </p>
    <button type="button" class="btn btn-outline btn-sm mt-2" @click="query.refetch()">
      Try again
    </button>
  </div>
  <slot v-else />
</template>

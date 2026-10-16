<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { useRecentDrafts } from '../lib/queries'
import QueryState from './QueryState.vue'

/** The few drafts the person edits, newest first, so Home can lead straight back into writing (#192). */
const drafts = useRecentDrafts()
</script>

<template>
  <!-- Nothing to pick up is nothing to show: no heading and no gap. -->
  <section
    v-if="drafts.isPending.value || drafts.isError.value || drafts.data.value?.length"
    class="mb-10 panel p-5"
    aria-labelledby="pick-up-heading"
  >
    <h2 id="pick-up-heading" class="mb-2 font-display text-xl font-semibold">Pick up</h2>
    <QueryState :query="drafts" what="your drafts">
      <ul class="space-y-3">
        <li
          v-for="d in drafts.data.value"
          :key="d.id"
          class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
        >
          <span class="min-w-0">
            <span class="block truncate font-medium">{{ d.title || 'Untitled draft' }}</span>
            <span class="block truncate text-sm text-ink-soft">
              {{ d.ideaName }} · {{ d.publicationName }}
            </span>
          </span>
          <RouterLink
            :to="{ name: 'draft', params: { publicationId: d.publicationId, id: d.id } }"
            class="link"
            >Continue<span class="sr-only"> “{{ d.title || 'Untitled draft' }}”</span></RouterLink
          >
        </li>
      </ul>
    </QueryState>
  </section>
</template>

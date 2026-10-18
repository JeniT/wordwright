<script setup lang="ts">
import type { OriginSource } from '../lib/note-label'
import NewTabLink from './NewTabLink.vue'

/**
 * Where a note came from, then who recorded it as a chip. A page it was taken from is a link to it, in a new tab. This
 * is a trusted space, so people are named; the chip is the person who took the note, which is not the author of
 * anything they quoted. Users have no pictures yet.
 */
defineProps<{ phrase: string; source?: OriginSource | null; authorName: string | null }>()
</script>

<template>
  <span class="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
    <span
      >{{ phrase }}
      <NewTabLink v-if="source" :href="source.url" class="link">{{
        source.title || source.url
      }}</NewTabLink></span
    >
    <span class="sr-only">, recorded by</span>
    <span
      v-if="authorName"
      class="rounded-full bg-accent-wash px-2 py-0.5 text-xs font-medium text-ink"
      >{{ authorName }}</span
    >
    <span v-else class="rounded-full bg-sunken px-2 py-0.5 text-xs text-ink-soft italic"
      >A former member</span
    >
  </span>
</template>

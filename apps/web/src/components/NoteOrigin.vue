<script setup lang="ts">
import { RouterLink } from 'vue-router'
import type { RouteLocationRaw } from 'vue-router'
import type { OriginSource } from '../lib/note-label'
import NewTabLink from './NewTabLink.vue'
import PersonChip from './PersonChip.vue'

/**
 * Where a note came from, then who recorded it as a chip on the line below. A page it was taken from is a link to it, in
 * a new tab; a conversation is a link to the idea's Refine page, where there is one. This
 * is a trusted space, so people are named; the chip is the person who took the note, which is not the author of
 * anything they quoted. Users have no pictures yet.
 */
defineProps<{
  phrase: string
  source?: OriginSource | null
  /** "conversation with your AI", for a note from Refine. */
  conversation?: string | null
  conversationTo?: RouteLocationRaw | null
  authorName: string | null
}>()
</script>

<template>
  <span class="inline-flex flex-col items-start gap-y-1">
    <span
      >{{ phrase }}
      <NewTabLink v-if="source" :href="source.url" class="link">{{
        source.title || source.url
      }}</NewTabLink
      ><template v-if="conversation"
        ><RouterLink v-if="conversationTo" :to="conversationTo" class="link">{{
          conversation
        }}</RouterLink
        ><template v-else>{{ conversation }}</template></template
      ></span
    >
    <span class="sr-only">, recorded by</span>
    <PersonChip :name="authorName" />
  </span>
</template>

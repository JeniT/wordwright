<script setup lang="ts">
import NewTabLink from './NewTabLink.vue'
import PublishedChip from './PublishedChip.vue'

/** A draft that has been published, as everyone who can read it sees it: when, and a link to the post if there is one. */
defineProps<{ publishedAt: string; publishedUrl: string | null }>()
</script>

<template>
  <p class="callout callout-ok flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" role="status">
    <PublishedChip :published-at="publishedAt" />
    <NewTabLink v-if="publishedUrl" :href="publishedUrl" class="link">View post</NewTabLink>
  </p>
</template>

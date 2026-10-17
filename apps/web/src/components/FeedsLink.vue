<script setup lang="ts">
import { RouterLink } from 'vue-router'

/**
 * The way to the feeds in the settings. A publication with none gets a button, since setting them up is the next
 * thing to do; one with some gets a quiet link, since it is rarely needed again.
 */
defineProps<{ publicationId: string; hasFeeds: boolean }>()
</script>

<template>
  <RouterLink
    :to="{ name: 'publication-settings-feeds', params: { publicationId } }"
    :class="hasFeeds ? 'link text-sm' : 'btn btn-outline'"
  >
    {{ hasFeeds ? 'Manage feeds' : 'Set up feeds →' }}
  </RouterLink>
</template>

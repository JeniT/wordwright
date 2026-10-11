<script setup lang="ts">
defineProps<{ tags: readonly string[] }>()
</script>

<template>
  <ul v-if="tags.length" aria-label="Tags" class="mt-1 flex flex-wrap gap-1">
    <li v-for="tag in tags" :key="tag" class="rounded-ctl bg-line px-1.5 py-0.5 text-xs text-ink">
      {{ tag }}
    </li>
  </ul>
</template>

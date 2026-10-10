<script setup lang="ts">
defineProps<{ tags: readonly string[] }>()
</script>

<template>
  <ul v-if="tags.length" aria-label="Tags" class="mt-1 flex flex-wrap gap-1">
    <li
      v-for="tag in tags"
      :key="tag"
      class="rounded bg-stone-200 px-1.5 py-0.5 text-xs text-stone-800"
    >
      {{ tag }}
    </li>
  </ul>
</template>

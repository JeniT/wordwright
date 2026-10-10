<script setup lang="ts">
/**
 * Where a note came from, then who recorded it as a chip. This is a trusted space, so people are named; the chip
 * is the person who took the note, which is not the author of anything they quoted. Users have no pictures yet.
 */
defineProps<{ phrase: string; authorName: string | null }>()
</script>

<template>
  <span class="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
    <span>{{ phrase }}</span>
    <span class="sr-only">, recorded by</span>
    <span
      v-if="authorName"
      class="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-900"
      >{{ authorName }}</span
    >
    <span v-else class="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-700 italic"
      >A former member</span
    >
  </span>
</template>

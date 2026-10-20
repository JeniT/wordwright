<script setup lang="ts">
/**
 * A person's name as a small rounded chip: who took a note, who edits a draft. This is a trusted space, so people are
 * named (never "you"); someone whose account has gone reads "A former member". Users have no pictures yet.
 */
defineProps<{ name: string | null }>()
</script>

<template>
  <span v-if="name" class="rounded-full bg-accent-wash px-2 py-0.5 text-xs font-medium text-ink">{{
    name
  }}</span>
  <span v-else class="rounded-full bg-sunken px-2 py-0.5 text-xs text-ink-soft italic"
    >A former member</span
  >
</template>

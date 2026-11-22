<script setup lang="ts">
/**
 * A person's name as a small rounded chip, saying who recorded, wrote or edits something: a note, a comment, a Refine message, a draft. This is a trusted space, so people are
 * named (never "you"); someone whose account has gone reads "A former member". Users have no pictures yet. Where only the
 * viewer could have written it there is no chip: `useAuthorship` decides.
 */
defineProps<{ name: string | null }>()
</script>

<template>
  <!-- In a ticked row, which has the same wash (`RowList`), the chip takes the surface colour so it still shows. -->
  <span
    v-if="name"
    class="rounded-full bg-accent-wash px-2 py-0.5 text-xs font-medium text-ink in-data-selected:bg-surface"
    >{{ name }}</span
  >
  <span v-else class="rounded-full bg-sunken px-2 py-0.5 text-xs text-ink-soft italic"
    >A former member</span
  >
</template>

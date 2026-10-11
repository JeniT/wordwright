<script setup lang="ts">
// Previous / Next with where you are. Used above and below a list: `label` tells the two apart for
// screen readers, and only one of them (`announce`) reads the new range out, so it isn't said twice.
defineProps<{
  label: string
  page: number
  pageCount: number
  first: number
  last: number
  total: number
  noun: string
  size: number
  announce?: boolean
}>()
defineEmits<{ go: [step: -1 | 1] }>()
</script>

<template>
  <nav :aria-label="label" class="flex items-center justify-between gap-3 text-sm">
    <button
      type="button"
      class="rounded border border-stone-300 bg-white px-3 py-2 disabled:opacity-40"
      :disabled="page <= 1"
      @click="$emit('go', -1)"
    >
      Previous<span class="sr-only"> {{ size }} {{ noun }}</span>
    </button>
    <p :aria-live="announce ? 'polite' : undefined" aria-atomic="true" class="text-stone-700">
      {{ noun.charAt(0).toUpperCase() + noun.slice(1) }} {{ first }}–{{ last }} of {{ total }}
    </p>
    <button
      type="button"
      class="rounded border border-stone-300 bg-white px-3 py-2 disabled:opacity-40"
      :disabled="page >= pageCount"
      @click="$emit('go', 1)"
    >
      Next<span class="sr-only"> {{ size }} {{ noun }}</span>
    </button>
  </nav>
</template>

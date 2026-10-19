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
  /** Words for the two buttons when "Previous" and "Next" are too vague ("Earlier research"). */
  previousLabel?: string
  nextLabel?: string
  /** One thing a page, so "Research 2 of 5" rather than "Research 2–2 of 5". */
  single?: boolean
}>()
defineEmits<{ go: [step: -1 | 1] }>()
</script>

<template>
  <nav :aria-label="label" class="flex items-center justify-between gap-3 text-sm">
    <button type="button" class="btn btn-neutral" :disabled="page <= 1" @click="$emit('go', -1)">
      <template v-if="previousLabel">{{ previousLabel }}</template>
      <template v-else
        >Previous<span class="sr-only"> {{ size }} {{ noun }}</span></template
      >
    </button>
    <p :aria-live="announce ? 'polite' : undefined" aria-atomic="true" class="text-ink-soft">
      {{ noun.charAt(0).toUpperCase() + noun.slice(1) }}
      {{ single ? first : `${first}–${last}` }} of {{ total }}
    </p>
    <button
      type="button"
      class="btn btn-neutral"
      :disabled="page >= pageCount"
      @click="$emit('go', 1)"
    >
      <template v-if="nextLabel">{{ nextLabel }}</template>
      <template v-else
        >Next<span class="sr-only"> {{ size }} {{ noun }}</span></template
      >
    </button>
  </nav>
</template>

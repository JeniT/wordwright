<script setup lang="ts">
import Explain from './Explain.vue'

/**
 * A heading with the explanation of the section it heads: the info icon right-aligned on the heading's row while
 * tutorial mode is off, the same text written out below the heading while it is on. The caller keeps its own heading
 * element (level, id, classes); this only lays the row out, so the icon is never left on a line of its own.
 */
defineProps<{
  /** The icon's name ("About owners"). */
  label: string
}>()
defineSlots<{
  /** The heading element. */
  default(): unknown
  /** The explanation. Leave it out (with `v-if` on the template) when there is nothing to say. */
  explain?(): unknown
}>()
</script>

<template>
  <div class="mb-3 flex flex-wrap items-center justify-between gap-x-2">
    <slot />
    <Explain v-if="$slots.explain" :label="label"><slot name="explain" /></Explain>
  </div>
</template>

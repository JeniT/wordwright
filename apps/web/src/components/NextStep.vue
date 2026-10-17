<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'
import { RouterLink } from 'vue-router'

/**
 * The end of a step: a suggestion for what often comes next, never a requirement. It is an outline button (not the
 * primary one), and a step where the next move is a choice, or the last step, simply doesn't have one.
 */
defineProps<{
  to: RouteLocationRaw
  label: string
  /** At the start of a page, as an invitation to do something first, rather than at the end. */
  top?: boolean
}>()
</script>

<template>
  <nav
    aria-label="Next step"
    class="flex flex-wrap items-center justify-between gap-4"
    :class="top ? 'mb-6 border-b border-line pb-4' : 'mt-12 border-t border-line pt-6'"
  >
    <p class="meta max-w-md"><slot /></p>
    <RouterLink :to="to" class="btn btn-outline">
      {{ label }} <span aria-hidden="true">→</span>
    </RouterLink>
  </nav>
</template>

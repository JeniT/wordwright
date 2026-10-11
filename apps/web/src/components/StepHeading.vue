<script setup lang="ts">
import { useNav } from '../lib/nav'

/**
 * The title of a numbered step: the idea or profile it belongs to, small, above; the step's number as a badge;
 * then the title. The number ties the page to the side menu and says "roughly here in the process" without
 * saying "do this first", so it is hidden from screen readers (the menu's list already says what order things are in).
 */
const { eyebrow, stepNumber } = useNav()
</script>

<template>
  <div class="mb-6">
    <p v-if="eyebrow" class="meta mb-1 break-words">{{ eyebrow }}</p>
    <h1 class="h1 flex items-center gap-3">
      <span v-if="stepNumber" class="step-num step-num-current step-num-lg" aria-hidden="true">{{
        stepNumber
      }}</span>
      <span class="min-w-0 break-words"><slot /></span>
    </h1>
  </div>
</template>

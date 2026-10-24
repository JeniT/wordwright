<script setup lang="ts">
import { useNav } from '../lib/nav'
import Breadcrumb from './Breadcrumb.vue'

/**
 * The title of a numbered step: the breadcrumb, small, above (on a phone the top bar holds it instead); the step's number as a badge;
 * then the title. The number ties the page to the side menu and says "roughly here in the process" without
 * saying "do this first", so it is hidden from screen readers (the menu's list already says what order things are in).
 */
const { crumbs, stepNumber, compact } = useNav()
</script>

<template>
  <div class="mb-6">
    <Breadcrumb v-if="!compact" :crumbs="crumbs" class="mb-1 max-md:hidden" />
    <h1 class="h1 flex items-center gap-3">
      <span v-if="stepNumber" class="step-num step-num-current step-num-lg" aria-hidden="true">{{
        stepNumber
      }}</span>
      <span class="min-w-0 break-words"><slot /></span>
    </h1>
  </div>
</template>

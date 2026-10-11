<script setup lang="ts">
import { useId } from 'vue'
import { stepNumber, type NavLevel } from '../lib/nav'

/**
 * One section of a landing page: a summary of a step, headed by the step's own number (the one in the menu, taken
 * from the same list so they can't drift apart) and set off from the one above by a light rule. `actions` is for
 * the links and buttons that belong to the section's heading ("See all", "New idea").
 */
const props = defineProps<{
  /** The level whose steps these are, and the step this summarises (a key from lib/nav.ts). */
  level: Exclude<NavLevel, 'home'>
  step: string
  title: string
}>()
defineSlots<{ default(): unknown; actions?(): unknown }>()
const headingId = useId()
const number = stepNumber(props.level, props.step)
</script>

<template>
  <section :aria-labelledby="headingId" class="mt-8 border-t border-line pt-6">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <h2 :id="headingId" class="flex items-center gap-3 font-display text-xl font-semibold">
        <span v-if="number" class="step-num" aria-hidden="true">{{ number }}</span>
        <span class="min-w-0 break-words">{{ title }}</span>
      </h2>
      <div v-if="$slots.actions" class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <slot name="actions" />
      </div>
    </div>
    <slot />
  </section>
</template>

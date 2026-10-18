<script setup lang="ts">
import { useId } from 'vue'
import { stepNumber, type NavLevel } from '../lib/nav'
import Explain from './Explain.vue'

/**
 * One section of a landing page: a summary of a step, headed by the step's own number (the one in the menu, taken
 * from the same list so they can't drift apart) and set off from the one above by a light rule. `actions` is for
 * the links and buttons that belong to the section's heading ("See all", "New idea"). A section that isn't a step
 * (Ideas) has no number; one inside another section (the steps under "Stuck for ideas?") is `nested`, with a
 * smaller heading one level down and no rule above it. `explain` is what a first-time person needs to know about
 * the step, shown by tutorial mode only.
 */
const props = defineProps<{
  /** The level whose steps these are, and the step this summarises (a key from lib/nav.ts). */
  level?: Exclude<NavLevel, 'home'>
  step?: string
  title: string
  nested?: boolean
  explain?: string
}>()
defineSlots<{ default(): unknown; actions?(): unknown }>()
const headingId = useId()
const number = props.level && props.step ? stepNumber(props.level, props.step) : ''
</script>

<template>
  <section
    :aria-labelledby="headingId"
    :class="nested ? 'mt-6 first:mt-0' : 'mt-8 border-t border-line pt-6'"
  >
    <div class="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <component
        :is="nested ? 'h3' : 'h2'"
        :id="headingId"
        class="flex items-center gap-3 font-display font-semibold"
        :class="nested ? 'text-lg' : 'text-xl'"
      >
        <span v-if="number" class="step-num" aria-hidden="true">{{ number }}</span>
        <span class="min-w-0 break-words">{{ title }}</span>
      </component>
      <div v-if="$slots.actions" class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <slot name="actions" />
      </div>
    </div>
    <Explain v-if="explain" tutorial-only class="mb-4">{{ explain }}</Explain>
    <slot />
  </section>
</template>

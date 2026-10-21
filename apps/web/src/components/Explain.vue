<script setup lang="ts">
import { useTutorialMode } from '../lib/tutorial'
import InfoTip from './InfoTip.vue'

/**
 * An explanation of a control or a page, in the place that suits the person: behind an info icon (`InfoTip`) while
 * tutorial mode is off, written out on the page below its control while it is on. The text is written once, so the
 * two can't drift apart. Two sentences at most, and never the only place for something needed to avoid a mistake.
 *
 * `tutorialOnly` is for what a page is for, which has no icon: it says nothing unless tutorial mode is on.
 */
defineProps<{
  /** The icon's name ("About moving links"). Not needed with `tutorialOnly`. */
  label?: string
  tutorialOnly?: boolean
}>()
const tutorial = useTutorialMode()
</script>

<template>
  <p v-if="tutorial" class="tutorial-note basis-full">
    <slot />
  </p>
  <InfoTip v-else-if="!tutorialOnly" :label="label ?? 'More information'"><slot /></InfoTip>
</template>

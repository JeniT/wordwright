<script setup lang="ts">
import { computed } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { RouterLink } from 'vue-router'
import { useNav } from '../lib/nav'

/**
 * The end of a page in a sequence: "← Previous: name" on the left and "Next: name →" on the right, a suggestion for
 * what often comes next, never a requirement. The links are outline buttons (not the primary one). With no props it
 * follows the page's own sequence (a level's numbered steps, or its group of settings pages), so the first page has
 * only Next and the last only Previous. Give `to` and `label` for a single link to somewhere else, which is also what
 * `top` does at the start of a page, as an invitation to do something first.
 */
const props = defineProps<{
  to?: RouteLocationRaw
  label?: string
  top?: boolean
}>()

const { neighbours } = useNav()
const previous = computed(() => (props.to ? undefined : neighbours.value.previous))
const next = computed(() =>
  props.to
    ? { to: props.to, text: props.label ?? '' }
    : neighbours.value.next && {
        to: neighbours.value.next.to,
        text: `Next: ${neighbours.value.next.text}`,
      },
)
</script>

<template>
  <nav
    v-if="previous || next"
    :aria-label="top || to ? 'Next step' : 'Previous and next'"
    class="flex flex-wrap items-center gap-4"
    :class="
      top ? 'mb-6 border-b border-line pb-4' : 'mt-12 justify-between border-t border-line pt-6'
    "
  >
    <p v-if="$slots.default" class="meta max-w-md"><slot /></p>
    <RouterLink v-if="previous" :to="previous.to" class="btn btn-outline">
      <span aria-hidden="true">←</span> Previous: {{ previous.text }}
    </RouterLink>
    <RouterLink v-if="next" :to="next.to" class="btn btn-outline ml-auto">
      {{ next.text }} <span aria-hidden="true">→</span>
    </RouterLink>
  </nav>
</template>

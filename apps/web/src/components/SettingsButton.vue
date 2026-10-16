<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'
import { RouterLink } from 'vue-router'
import Icon from './Icon.vue'

/**
 * The way into the settings of whatever it sits beside: the account, a publication or an idea. Always the same gear,
 * so its name ("Publication settings") and its place next to the name it configures say which one it is. It is a
 * link (it goes to a page), is marked current on its own page, and is 44px square (docs/design.md, Navigation):
 * `w-11!` overrides the 36px width `btn-icon` sets for buttons that repeat on every row.
 */
defineProps<{ to: RouteLocationRaw; label: string }>()
</script>

<template>
  <RouterLink
    :to="to"
    :title="label"
    :aria-label="label"
    class="btn btn-icon btn-ghost min-h-11 w-11! shrink-0"
  >
    <Icon name="settings" />
  </RouterLink>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router'
import type { Crumb } from '../lib/nav'

/**
 * Where the page sits: Publication › Idea (Publication › Settings; Account). Every crumb is a link and the page you
 * are on is left to its heading, so there is no Home crumb either (the mark is Home on a phone, the menu's Wordwright
 * link on a desktop). Long names truncate one at a time, the earliest first, so the last crumb keeps its room.
 */
defineProps<{ crumbs: Crumb[] }>()
</script>

<template>
  <nav v-if="crumbs.length" aria-label="Breadcrumb" class="meta">
    <div class="flex items-baseline">
      <span
        v-for="(crumb, index) in crumbs"
        :key="index"
        class="flex min-w-0 items-baseline"
        :style="{ flexShrink: index === crumbs.length - 1 ? 1 : 4 }"
      >
        <span v-if="index" aria-hidden="true" class="px-1.5">›</span>
        <RouterLink :to="crumb.to" class="link block min-w-0 truncate">{{
          crumb.label
        }}</RouterLink>
      </span>
    </div>
  </nav>
</template>

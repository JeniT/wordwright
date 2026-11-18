<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import type { Crumb } from '../lib/nav'

/**
 * Where the page sits: Publication › Idea (Publication › Settings; Account). Every crumb is a link and the page you
 * are on is left to its heading, so there is no Home crumb either (the mark is Home on a phone, the menu's Wordwright
 * link on a desktop). The last crumb keeps most of the room. The earlier ones are never squeezed to a letter or
 * two: each keeps its whole name when it is short, and is cut off at an equal share of 40% of the line when it is long.
 */
const props = defineProps<{ crumbs: Crumb[] }>()
const earlierShare = computed(() => `${40 / Math.max(1, props.crumbs.length - 1)}%`)
</script>

<template>
  <nav v-if="crumbs.length" aria-label="Breadcrumb" class="meta">
    <div class="flex items-baseline">
      <span
        v-for="(crumb, index) in crumbs"
        :key="index"
        class="flex min-w-0 items-baseline"
        :style="
          index === crumbs.length - 1
            ? { flexShrink: 1 }
            : { flexShrink: 0, maxWidth: earlierShare }
        "
      >
        <span v-if="index" aria-hidden="true" class="px-1.5">›</span>
        <RouterLink :to="crumb.to" class="link block min-w-0 truncate">{{
          crumb.label
        }}</RouterLink>
      </span>
    </div>
  </nav>
</template>

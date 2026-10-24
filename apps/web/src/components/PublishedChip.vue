<script setup lang="ts">
import { computed } from 'vue'
import Icon from './Icon.vue'

/**
 * "Published Oct 20, 2026" with a tick: a draft its editor has marked published. The words and the tick carry it, so it
 * never relies on its green alone (docs/design/accessibility.md).
 */
const props = defineProps<{ publishedAt: string }>()
const date = computed(() =>
  new Date(props.publishedAt).toLocaleDateString(undefined, { dateStyle: 'medium' }),
)
</script>

<template>
  <span class="chip chip-ok inline-flex items-center gap-1">
    <Icon name="check" :size="14" />Published <time :datetime="publishedAt">{{ date }}</time>
  </span>
</template>

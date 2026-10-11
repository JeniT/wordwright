<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    id: string
    name: string
    imageUrl?: string | null
    size?: 'xs' | 'sm' | 'md' | 'lg'
    /**
     * `profile`: the person's own picture, cropped to fill the tile.
     * `source`: an icon fetched from another website. We can't control its shape or colours, so it sits on a light
     * plate, contained and uncropped (see `source-mark` in theme/theme.css and docs/design.md).
     */
    kind?: 'profile' | 'source'
  }>(),
  { imageUrl: null, size: 'md', kind: 'profile' },
)

// A palette-matched tint, chosen from the id so a profile or source keeps its colour everywhere.
const TINTS = ['tint-1', 'tint-2', 'tint-3', 'tint-4', 'tint-5', 'tint-6']
const tint = computed(() => {
  let hash = 0
  for (const ch of props.id) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0
  return TINTS[hash % TINTS.length]
})
const initial = computed(() => (Array.from(props.name.trim())[0] ?? '?').toUpperCase())
const dimension = { xs: '2rem', sm: '3rem', md: '4rem', lg: '6rem' }
const sizeStyle = computed(() => ({ '--mark-size': dimension[props.size] }))
</script>

<template>
  <!-- Decorative: the name is always shown next to it. -->
  <span v-if="imageUrl && kind === 'source'" class="source-mark" :style="sizeStyle">
    <img :src="imageUrl" alt="" />
  </span>
  <img
    v-else-if="imageUrl"
    :src="imageUrl"
    alt=""
    class="source-mark !object-cover !p-0"
    :style="sizeStyle"
  />
  <span v-else aria-hidden="true" class="source-letter" :class="tint" :style="sizeStyle">{{
    initial
  }}</span>
</template>

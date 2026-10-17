<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    id: string
    name: string
    imageUrl?: string | null
    /**
     * The icon of the publication's website, a guest: used only when there is no `imageUrl`, and then drawn like any other
     * site's picture (on the plate, contained), never cropped into the slot for the person's own picture.
     */
    siteIconUrl?: string | null
    /** The site icon is square to its corners (`siteIconSquare`), so it fills the box instead of sitting on the plate. */
    siteIconSquare?: boolean
    /** Same, for a `kind="source"` picture passed as `imageUrl` (a feed's icon). */
    square?: boolean
    size?: 'xs' | 'sm' | 'md' | 'lg'
    /**
     * `publication`: the person's own picture, cropped to fill the tile.
     * `source`: an icon fetched from another website. We can't control its shape or colours, so it sits on a light
     * plate, contained and uncropped (see `source-mark` in theme/theme.css and docs/design.md).
     */
    kind?: 'publication' | 'source'
  }>(),
  {
    imageUrl: null,
    siteIconUrl: null,
    siteIconSquare: false,
    square: false,
    size: 'md',
    kind: 'publication',
  },
)

// A palette-matched tint, chosen from the id so a publication or source keeps its colour everywhere.
const TINTS = ['tint-1', 'tint-2', 'tint-3', 'tint-4', 'tint-5', 'tint-6']
const tint = computed(() => {
  let hash = 0
  for (const ch of props.id) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0
  return TINTS[hash % TINTS.length]
})
// The person's own picture always wins over their website's icon.
const shownIcon = computed(() =>
  props.kind === 'source' ? props.imageUrl : props.imageUrl ? null : props.siteIconUrl,
)
// Only another site's picture is ever filled; it stays framed by the same border, and any other shape stays on the plate.
const fills = computed(() => (props.kind === 'source' ? props.square : props.siteIconSquare))
const initial = computed(() => (Array.from(props.name.trim())[0] ?? '?').toUpperCase())
const dimension = { xs: '2rem', sm: '3rem', md: '4rem', lg: '6rem' }
const sizeStyle = computed(() => ({ '--mark-size': dimension[props.size] }))
</script>

<template>
  <!-- Decorative: the name is always shown next to it. -->
  <span v-if="shownIcon" class="source-mark" :data-fill="fills || undefined" :style="sizeStyle">
    <img :src="shownIcon" alt="" />
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

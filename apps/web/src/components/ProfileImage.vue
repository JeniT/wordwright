<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    id: string
    name: string
    imageUrl?: string | null
    size?: 'sm' | 'md' | 'lg'
  }>(),
  { imageUrl: null, size: 'md' },
)

// Muted, book-cover colours. Chosen from the id, so a profile keeps its colour everywhere.
const TINTS = [
  'bg-teal-100 text-teal-900',
  'bg-amber-100 text-amber-900',
  'bg-rose-100 text-rose-900',
  'bg-sky-100 text-sky-900',
  'bg-lime-100 text-lime-900',
  'bg-violet-100 text-violet-900',
]
const tint = computed(() => {
  let hash = 0
  for (const ch of props.id) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0
  return TINTS[hash % TINTS.length]
})
const initial = computed(() => (Array.from(props.name.trim())[0] ?? '?').toUpperCase())
const sizes = { sm: 'size-12 text-xl', md: 'size-16 text-2xl', lg: 'size-24 text-4xl' }
</script>

<template>
  <!-- Decorative: the profile's name is always shown next to it. -->
  <img
    v-if="imageUrl"
    :src="imageUrl"
    alt=""
    class="shrink-0 rounded-lg bg-stone-100 object-cover"
    :class="sizes[size]"
  />
  <span
    v-else
    aria-hidden="true"
    class="inline-flex shrink-0 items-center justify-center rounded-lg font-serif font-semibold"
    :class="[sizes[size], tint]"
    >{{ initial }}</span
  >
</template>

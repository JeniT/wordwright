<script setup lang="ts">
import { useId } from 'vue'
import Icon from './Icon.vue'

/**
 * A small information icon that holds the longer explanation of a control, so the control itself stays short. The
 * text shows while the pointer is over the icon or the icon has focus (so a tap or the keyboard gets it too), and
 * it is also the icon's description for screen readers.
 */
defineProps<{ label: string }>()
const id = useId()
</script>

<template>
  <span class="group relative inline-flex">
    <button
      type="button"
      class="btn btn-sm btn-icon btn-ghost !min-h-7 !w-7"
      :aria-label="label"
      :aria-describedby="id"
    >
      <Icon name="info" :size="16" />
    </button>
    <span
      :id="id"
      role="tooltip"
      class="pointer-events-none absolute top-full right-0 z-20 mt-1 hidden w-64 rounded-ctl border border-line-strong bg-surface p-2 text-xs text-ink group-focus-within:block group-hover:block"
    >
      <slot />
    </span>
  </span>
</template>

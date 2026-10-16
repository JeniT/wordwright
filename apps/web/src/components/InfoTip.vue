<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId } from 'vue'
import Icon from './Icon.vue'

/**
 * A small information icon that holds the longer explanation of a control, so the control itself stays short. The
 * text shows while the pointer is over the icon or the tip, or the icon has focus (so a tap or the keyboard gets it
 * too), and it is also the icon's description for screen readers. Escape hides it without moving focus; it comes
 * back on the next hover or focus (WCAG 1.4.13: dismissable, hoverable, persistent).
 */
defineProps<{ label: string }>()
const id = useId()
const dismissed = ref(false)
let hovered = false
let focused = false

function enter(kind: 'hover' | 'focus') {
  if (kind === 'hover') hovered = true
  else focused = true
  dismissed.value = false
}
function leave(kind: 'hover' | 'focus') {
  if (kind === 'hover') hovered = false
  else focused = false
}
// On the document, because the pointer can be over the tip while focus is elsewhere. Not stopped or prevented, so an
// Escape that also closes a dialog still does.
function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape' && (hovered || focused)) dismissed.value = true
}
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <span
    class="group relative inline-flex"
    :data-dismissed="dismissed ? '' : undefined"
    @mouseenter="enter('hover')"
    @mouseleave="leave('hover')"
    @focusin="enter('focus')"
    @focusout="leave('focus')"
  >
    <button
      type="button"
      class="btn btn-sm btn-icon btn-ghost !min-h-7 !w-7"
      :aria-label="label"
      :aria-describedby="id"
    >
      <Icon name="info" :size="16" />
    </button>
    <!-- The padding (not a margin) bridges the gap, so the pointer can travel from the icon onto the tip. -->
    <span
      :id="id"
      role="tooltip"
      class="absolute top-full right-0 z-20 hidden w-64 pt-1 group-focus-within:block group-hover:block group-data-[dismissed]:!hidden"
    >
      <span class="block rounded-ctl border border-line-strong bg-surface p-2 text-xs text-ink">
        <slot />
      </span>
    </span>
  </span>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId, useTemplateRef } from 'vue'
import Icon from './Icon.vue'

/**
 * A small information icon that holds the longer explanation of a control, so the control itself stays short. The
 * text shows while the pointer is over the icon or the tip, or the icon has focus (so a tap or the keyboard gets it
 * too), and it is also the icon's description for screen readers. Escape hides it without moving focus; it comes
 * back on the next hover or focus (WCAG 1.4.13: dismissable, hoverable, persistent). It opens towards whichever side
 * has room, measured against the nearest scrolling or clipping ancestor (the side panel clips what overflows it), so
 * it is not cropped wherever the icon is.
 */
defineProps<{ label: string }>()
const id = useId()
const dismissed = ref(false)
let hovered = false
let focused = false

/** Width of the tip (`w-64`) and the height to leave for it when choosing above or below. */
const TIP_WIDTH = 256
const TIP_HEIGHT = 120
const root = useTemplateRef<HTMLElement>('root')
const towardsLeft = ref(true)
const above = ref(false)

/** The box the tip must stay inside: the nearest ancestor that clips, else the window. */
function boundsOf(el: HTMLElement) {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(p)
    if (overflowX !== 'visible' || overflowY !== 'visible') return p.getBoundingClientRect()
  }
  return new DOMRect(0, 0, window.innerWidth, window.innerHeight)
}
/** Opens to the right of the icon's left edge if that has room, else leftwards; below if there is room, else above. */
function place() {
  if (!root.value) return
  const icon = root.value.getBoundingClientRect()
  const bounds = boundsOf(root.value)
  const room = {
    right: bounds.right - icon.left,
    left: icon.right - bounds.left,
    below: bounds.bottom - icon.bottom,
    above: icon.top - bounds.top,
  }
  towardsLeft.value = room.right < TIP_WIDTH && room.left > room.right
  above.value = room.below < TIP_HEIGHT && room.above > room.below
}

function enter(kind: 'hover' | 'focus') {
  if (kind === 'hover') hovered = true
  else focused = true
  place()
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
    ref="root"
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
      class="absolute z-20 hidden w-64 group-focus-within:block group-hover:block group-data-[dismissed]:!hidden"
      :class="[towardsLeft ? 'right-0' : 'left-0', above ? 'bottom-full pb-1' : 'top-full pt-1']"
    >
      <span class="block rounded-ctl border border-line-strong bg-surface p-2 text-xs text-ink">
        <slot />
      </span>
    </span>
  </span>
</template>

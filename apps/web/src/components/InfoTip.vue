<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId, useTemplateRef } from 'vue'
import Icon from './Icon.vue'

/**
 * A small information icon that holds the longer explanation of a control, so the control itself stays short. The
 * text shows while the pointer is over the icon or the tip, or the icon has focus (so a tap or the keyboard gets it
 * too), and it is also the icon's description for screen readers. Escape hides it without moving focus; it comes
 * back on the next hover or focus (WCAG 1.4.13: dismissable, hoverable, persistent). It slides sideways, and narrows if
 * it must, to stay inside the nearest scrolling or clipping ancestor (the side panel clips what overflows it), and
 * opens above the icon when there is no room below, so it is not cropped wherever the icon is.
 */
defineProps<{ label: string }>()
const id = useId()
const dismissed = ref(false)
let hovered = false
let focused = false

/** The tip's usual width (16rem), the room to keep clear of the edge, and the height to leave when choosing above or below. */
const TIP_WIDTH = 256
const MARGIN = 8
const TIP_HEIGHT = 120
const root = useTemplateRef<HTMLElement>('root')
/** Where the tip sits: shifted along from the icon's left edge, and as wide as fits. */
const offset = ref(0)
const width = ref(TIP_WIDTH)
const above = ref(false)

/** The box the tip must stay inside: the nearest ancestor that clips (less its scrollbar), else the window. */
function boundsOf(el: HTMLElement) {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(p)
    if (overflowX === 'visible' && overflowY === 'visible') continue
    const box = p.getBoundingClientRect()
    const left = box.left + p.clientLeft
    return new DOMRect(left, box.top, p.clientWidth || box.width, box.height)
  }
  return new DOMRect(0, 0, window.innerWidth, window.innerHeight)
}
/**
 * Starts at the icon's left edge and slides left as far as it must to stay inside the bounds, narrowing if even then
 * it is too wide; opens below the icon unless there is too little room and more above.
 */
function place() {
  if (!root.value) return
  const icon = root.value.getBoundingClientRect()
  const bounds = boundsOf(root.value)
  width.value = Math.min(TIP_WIDTH, Math.max(0, bounds.width - 2 * MARGIN))
  const left = Math.max(
    bounds.left + MARGIN,
    Math.min(icon.left, bounds.right - MARGIN - width.value),
  )
  offset.value = left - icon.left
  const room = { below: bounds.bottom - icon.bottom, above: icon.top - bounds.top }
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
      class="absolute z-20 hidden group-focus-within:block group-hover:block group-data-[dismissed]:!hidden"
      :class="above ? 'bottom-full pb-1' : 'top-full pt-1'"
      :style="{ left: `${offset}px`, width: `${width}px` }"
    >
      <span class="block rounded-ctl border border-line-strong bg-surface p-2 text-xs text-ink">
        <slot />
      </span>
    </span>
  </span>
</template>

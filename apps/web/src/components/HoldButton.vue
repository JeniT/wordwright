<script lang="ts">
/** How long after a tap the button waits for the second one before it goes back. */
export const ARMED_MS = 5000
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId } from 'vue'
import { holdDuration } from '../lib/hold-settings'
import { vTip } from '../lib/tip'

/**
 * A button that asks for a deliberate act instead of a dialog, in either of two ways. Press and hold it until the
 * ring fills (the mouse, a finger, or Enter or Space held down). Or tap it: it changes to "Delete?" (the `verb`), and
 * a second tap, within a few seconds, goes ahead. The tap is also what assistive technology that "clicks" without
 * holding gets. Moving off it mid-hold, tabbing away or pressing Escape cancels. Use it for removing one thing that
 * can't be got back.
 */
const props = withDefaults(
  defineProps<{
    /** Overrides the app-wide hold time (`lib/hold-settings`); for tests. */
    holdMs?: number
    disabled?: boolean
    /** The action in one word, for the armed button: "Delete" shows "Delete?". */
    verb?: string
    /** What the button does, shown on hover and keyboard focus (`v-tip`, which can't go on a component with several roots). */
    tip?: string
  }>(),
  { holdMs: undefined, disabled: false, verb: 'Confirm', tip: undefined },
)
const duration = computed(() => props.holdMs ?? holdDuration())
const emit = defineEmits<{ confirm: [] }>()
defineOptions({ inheritAttrs: false })

const hintId = useId()
const holding = ref(false)
const armed = ref(false)
const announcement = ref('')
/** Where the ring is drawn: around the pointer, or over the button for the keyboard. */
const ring = ref({ x: 0, y: 0 })
const button = ref<HTMLButtonElement>()

let timer: ReturnType<typeof setTimeout> | undefined
let armedTimer: ReturnType<typeof setTimeout> | undefined
/** When a press or key last ended: the click that follows it is part of that hold, not a separate act. */
let lastHoldEvent = -Infinity
const wasJustHeld = () => Date.now() - lastHoldEvent < 500

const reducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const motionReduced = ref(reducedMotion())

function start(x: number, y: number) {
  if (props.disabled || holding.value) return
  ring.value = { x, y }
  holding.value = true
  announcement.value = 'Keep holding to confirm.'
  timer = setTimeout(() => {
    finish()
    disarm()
    announcement.value = 'Confirmed.'
    emit('confirm')
  }, duration.value)
}
function finish() {
  clearTimeout(timer)
  holding.value = false
  lastHoldEvent = Date.now()
}
/** Gives up a hold that has not finished (moved off the button, or focus left). */
function cancel() {
  if (!holding.value) return
  finish()
  announcement.value = 'Cancelled. Nothing was changed.'
}
/** A press that ended before the ring filled, or an activation with no hold at all: the first arms, the second confirms. */
function tap() {
  if (props.disabled) return
  if (armed.value) {
    disarm()
    announcement.value = 'Confirmed.'
    emit('confirm')
    return
  }
  armed.value = true
  announcement.value = 'Press again to confirm.'
  armedTimer = setTimeout(() => {
    armed.value = false
    announcement.value = 'Cancelled. Nothing was changed.'
  }, ARMED_MS)
}
/** The press or key ended: a hold that was still running was a tap. */
function release() {
  lastHoldEvent = Date.now() // the click that follows belongs to this press
  if (!holding.value) return
  finish()
  tap()
}
function disarm() {
  clearTimeout(armedTimer)
  armed.value = false
}
onBeforeUnmount(() => {
  clearTimeout(timer)
  clearTimeout(armedTimer)
})

// ---- pointer: a mouse, a finger or a pen
/** On a touch screen the finger would hide a ring under it, so the ring is drawn above. */
const lift = (event: PointerEvent) => (event.pointerType === 'touch' ? 48 : 0)
function onPointerDown(event: PointerEvent) {
  if (event.button > 0) return // only the main button
  // Keep the pointer's events even when it drifts off the button; leaving is checked in onPointerMove.
  button.value?.setPointerCapture?.(event.pointerId)
  start(event.clientX, event.clientY - lift(event))
}
function onPointerEnd(event: PointerEvent) {
  if (event.type === 'pointercancel') {
    lastHoldEvent = Date.now()
    cancel()
  } else release()
}
function onPointerMove(event: PointerEvent) {
  if (!holding.value) return
  const rect = button.value?.getBoundingClientRect()
  const outside =
    !!rect &&
    rect.width > 0 &&
    (event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom)
  if (outside) return cancel()
  ring.value = { x: event.clientX, y: event.clientY - lift(event) }
}

// ---- keyboard: hold Enter or Space
function onKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape' && armed.value) {
    disarm()
    announcement.value = 'Cancelled. Nothing was changed.'
    return
  }
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault() // no click on keyup: only a full hold counts
  if (event.repeat) return
  const rect = button.value?.getBoundingClientRect()
  start((rect?.left ?? 0) + (rect?.width ?? 0) / 2, (rect?.top ?? 0) + (rect?.height ?? 0) / 2)
}
function onKeyUp(event: KeyboardEvent) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  release()
}
function onBlur() {
  cancel()
  disarm()
}

// ---- a click that no press or key led to (assistive technology): the same as a tap
function onClick() {
  if (wasJustHeld()) return
  tap()
}

const durationStyle = computed(() => ({ animationDuration: `${duration.value}ms` }))
const ringStyle = computed(() => ({ left: `${ring.value.x}px`, top: `${ring.value.y}px` }))
</script>

<template>
  <button
    ref="button"
    v-tip="tip"
    v-bind="$attrs"
    type="button"
    :disabled="disabled"
    :aria-describedby="hintId"
    class="touch-none select-none [-webkit-touch-callout:none]"
    :data-armed="armed || undefined"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerEnd"
    @pointercancel="onPointerEnd"
    @contextmenu.prevent
    @keydown="onKeyDown"
    @keyup="onKeyUp"
    @blur="onBlur"
    @click="onClick"
  >
    <template v-if="armed">{{ verb }}?</template>
    <template v-else-if="holding && motionReduced">Keep holding…</template>
    <slot v-else />
    <span
      v-if="holding && !motionReduced"
      data-testid="hold-ring"
      aria-hidden="true"
      class="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 text-accent"
      :style="ringStyle"
    >
      <svg width="44" height="44" viewBox="0 0 44 44" class="-rotate-90 drop-shadow">
        <circle
          cx="22"
          cy="22"
          r="17"
          fill="var(--color-surface)"
          fill-opacity="0.9"
          stroke="var(--color-line-strong)"
          stroke-width="5"
        />
        <circle
          class="hold-fill"
          :style="durationStyle"
          cx="22"
          cy="22"
          r="17"
          fill="none"
          stroke="currentColor"
          stroke-width="5"
          stroke-linecap="round"
          pathLength="100"
        />
      </svg>
    </span>
  </button>
  <span :id="hintId" class="sr-only">
    Press and hold to confirm, or tap it once and then again within a few seconds. Moving off it
    while holding cancels.
  </span>
  <span class="sr-only" aria-live="polite">{{ announcement }}</span>
</template>

<style scoped>
.hold-fill {
  stroke-dasharray: 100;
  stroke-dashoffset: 100;
  animation-name: hold-fill;
  animation-timing-function: linear;
  animation-fill-mode: forwards;
}
@keyframes hold-fill {
  to {
    stroke-dashoffset: 0;
  }
}
</style>
